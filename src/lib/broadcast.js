import {tick} from 'svelte'
import {playTrack, play, seekTo, setUserInitiatedPlay, getMediaPlayer} from '$lib/api'
import {appState, addDeck, removeDeck} from '$lib/app-state.svelte'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {broadcastsCollection, channelsCollection, tracksCollection, ensureTracksLoaded} from '$lib/tanstack/collections'

const log = logger.ns('broadcast').seal()

/** Get slug for a channel ID, or short ID if not found */
function label(channelId) {
	return channelsCollection.get(channelId)?.slug || channelId?.slice(0, 8)
}

/** @param {string} channelId */
function isV1Channel(channelId) {
	return channelsCollection.get(channelId)?.source === 'v1'
}

/** @param {string} trackId */
export function isV1Track(trackId) {
	const track = tracksCollection.get(trackId)
	if (!track) return false
	const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
	return channel?.source === 'v1'
}

/** Supabase realtime channels keyed by deckId
 * @type {Map<number, any>}
 */
const broadcastChannels = new Map()

/** Broadcaster realtime state channels keyed by channelId
 * @type {Map<string, {channel: any, intervalId: ReturnType<typeof setInterval>}>}
 */
const broadcastStateChannels = new Map()

/** Listener realtime state channels keyed by channelId
 * @type {Map<string, any>}
 */
const broadcastStateListeners = new Map()

/** Broadcast table listeners keyed by channelId (for state refresh)
 * @type {Map<string, any>}
 */
const broadcastTableListeners = new Map()
const lastAppliedSeek = new Map()
const broadcastStateSeqByChannel = new Map()
const lastReceivedStateSeqByChannel = new Map()
const seekJobSeqByDeck = new Map()

/**
 * Tracks the broadcaster's last known seek "intent" per deck.
 * We only re-seek when this fingerprint changes — periodic polls
 * with the same intent are ignored to prevent seek loops.
 * @type {Map<number, {seeked_at: string|null, track_played_at: string|null, is_playing: boolean, seek_position: number|null}>}
 */
const lastSeekIntent = new Map()

/** @param {string} channelId */
export function isUserBroadcasting(channelId) {
	if (!channelId) return false
	if (broadcastsCollection.state.get(channelId)) return true
	return Object.values(appState.decks).some((deck) => deck.broadcasting_channel_id === channelId)
}

/** @param {string} channelId */
export function notifyBroadcastState(channelId) {
	if (!broadcastStateChannels.has(channelId)) {
		startBroadcastState(channelId)
		return
	}
	broadcastStateUpdate(channelId)
}

export function getBroadcastingChannelId() {
	return Object.values(appState.decks).find((deck) => deck.broadcasting_channel_id)?.broadcasting_channel_id
}

/**
 * @param {number} deckId
 * @param {string} channelId
 */
export async function joinBroadcast(deckId, channelId) {
	console.info('[broadcast] joinBroadcast', {deckId, channelId})
	try {
		// If switching channels without leaving first, tear down old listeners.
		const previousListeningChannels = new Set(
			Object.values(appState.decks)
				.map((deck) => deck.listening_to_channel_id)
				.filter((id) => Boolean(id && id !== channelId))
		)
		for (const previousChannelId of previousListeningChannels) {
			stopBroadcastStateListener(previousChannelId)
			stopBroadcastTableListener(previousChannelId)
		}

		const {data} = await sdk.supabase.from('broadcast').select('*').eq('channel_id', channelId).single().throwOnError()

		// Prefetch all tracks for this channel
		const broadcast = broadcastsCollection.state.get(channelId)
		const slug = broadcast?.channels.slug
		if (slug) {
			try {
				await ensureTracksLoaded(slug)
				log.log(`prefetching ${slug}`)
			} catch (error) {
				log.warn('prefetch_skipped', {slug, error: /** @type {Error} */ (error).message})
			}
		}

		// Tear down all existing decks before applying broadcast state
		for (const id of getSortedDeckIds()) {
			stopBroadcastSync(id)
			removeDeck(id)
		}

		// Use decks jsonb if available (multi-deck), fall back to single-deck fields
		if (Array.isArray(data?.decks) && data.decks.length) {
			await applyBroadcastState(channelId, data.decks)
		} else if (data?.track_id) {
			const deck = addDeck()
			deck.listening_to_channel_id = channelId
			deck.hide_queue_panel = true
			await playBroadcastTrack(deck.id, data)
		}

		// Set active deck to the first listener deck
		const listenerIds = getSortedDeckIds().filter((id) => appState.decks[id]?.listening_to_channel_id === channelId)
		if (listenerIds.length) {
			appState.active_deck_id = listenerIds[0]
		}

		startBroadcastStateListener(channelId)
		startBroadcastTableListener(channelId)
		log.log(`joined ${label(channelId)} on ${listenerIds.length} deck(s)`)
	} catch (error) {
		log.error(`join failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
	}
}

/** @param {number} deckId */
export function leaveBroadcast(deckId) {
	const channelId = appState.decks[deckId]?.listening_to_channel_id
	stopBroadcastSync(deckId)
	if (channelId) {
		stopBroadcastStateListener(channelId)
		stopBroadcastTableListener(channelId)
		const decksToClose = Object.entries(appState.decks)
			.filter(([, deck]) => deck.listening_to_channel_id === channelId)
			.map(([id]) => Number(id))
		for (const id of decksToClose) {
			stopBroadcastSync(id)
			removeDeck(id)
		}
	} else {
		// Fallback: if invoked on a non-listening deck, preserve old behavior.
		const deck = appState.decks[deckId]
		if (deck) {
			deck.listening_to_channel_id = undefined
			deck.is_playing = false
		}
	}
	log.log(`left deck ${deckId}`)
}

/**
 * Helper to upsert a broadcast record with full deck state.
 * @param {string} channelId
 */
export async function upsertRemoteBroadcast(channelId) {
	return sdk.supabase
		.from('broadcast')
		.upsert(
			{
				channel_id: channelId,
				track_played_at: new Date().toISOString(),
				decks: getBroadcastDeckState()
			},
			{onConflict: 'channel_id'}
		)
		.throwOnError()
}

/**
 * @param {string} channelId
 * @param {string} [trackId]
 */
export async function startBroadcast(channelId, trackId) {
	console.info('[broadcast] startBroadcast', {channelId, trackId})
	if (!trackId) {
		log.log(`skipped ${label(channelId)} (no track)`)
		return
	}
	if (isV1Channel(channelId)) {
		throw new Error('Legacy channels cannot broadcast')
	}

	await upsertRemoteBroadcast(channelId)
	startBroadcastState(channelId)
	broadcastStateUpdate(channelId)
	log.log(`started ${label(channelId)}`)
}

/**
 * @param {string} channelId
 */
export async function stopBroadcast(channelId) {
	if (!channelId) return
	try {
		await sdk.supabase.from('broadcast').delete().eq('channel_id', channelId).throwOnError()
		// Optimistic local sync so UI updates immediately even if realtime is delayed.
		if (broadcastsCollection.state.has(channelId)) {
			broadcastsCollection.utils.writeDelete(channelId)
		}
		for (const deck of Object.values(appState.decks)) {
			if (deck.broadcasting_channel_id === channelId) {
				deck.broadcasting_channel_id = undefined
			}
		}
		stopBroadcastState(channelId)
		log.log(`stopped ${label(channelId)}`)
	} catch (error) {
		log.error(`stop failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
		throw error
	}
}

/** @param {number} deckId */
function stopBroadcastSync(deckId) {
	const channel = broadcastChannels.get(deckId)
	if (channel) {
		log.log('stopping_sync', {deckId})
		channel.unsubscribe()
		broadcastChannels.delete(deckId)
	}
	lastSeekIntent.delete(deckId)
	lastAppliedSeek.delete(deckId)
	seekJobSeqByDeck.delete(deckId)
}

/**
 * Calculate elapsed seconds from track_played_at
 * @param {import('$lib/types').Broadcast} broadcast
 * @param {import('$lib/types').Track} track
 * @returns {number|undefined}
 */
function calculateSeekTime(broadcast, track) {
	if (broadcast.seek_position != null) {
		if (broadcast.seeked_at) {
			const elapsed = (Date.now() - new Date(broadcast.seeked_at).getTime()) / 1000
			if (elapsed < 0) return undefined
			const base = broadcast.is_playing ? broadcast.seek_position + elapsed : broadcast.seek_position
			if (track.duration && base >= track.duration) return undefined
			return Math.round(base)
		}
		return Math.round(broadcast.seek_position)
	}
	if (!broadcast.track_played_at) return undefined
	const elapsed = (Date.now() - new Date(broadcast.track_played_at).getTime()) / 1000
	if (elapsed < 0) return undefined
	if (track.duration && elapsed >= track.duration) return undefined
	return Math.round(elapsed)
}

function nextSeekJobId(deckId) {
	const next = (seekJobSeqByDeck.get(deckId) ?? 0) + 1
	seekJobSeqByDeck.set(deckId, next)
	return next
}

async function seekWhenReady(deckId, seconds, jobId) {
	const deadline = performance.now() + 8000
	let mediaEl
	while (performance.now() < deadline) {
		if (seekJobSeqByDeck.get(deckId) !== jobId) return false
		mediaEl = getMediaPlayer(deckId)
		if (mediaEl && typeof mediaEl.currentTime === 'number') {
			const hasDuration = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
			if (hasDuration || mediaEl.currentTime > 0) break
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	if (!mediaEl || typeof mediaEl.currentTime !== 'number') return false

	if (seekJobSeqByDeck.get(deckId) !== jobId) return false
	seekTo(deckId, seconds)

	// Retry seek up to 10 times if position hasn't landed yet
	let adjustTries = 10
	while (adjustTries > 0) {
		if (seekJobSeqByDeck.get(deckId) !== jobId) return false
		if (Math.abs(mediaEl.currentTime - seconds) < 1) break
		seekTo(deckId, seconds)
		await new Promise((r) => setTimeout(r, 200))
		adjustTries--
	}

	// Only start playback after seek has landed
	if (seekJobSeqByDeck.get(deckId) !== jobId) return false
	const deck = appState.decks[deckId]
	if (deck?.is_playing) play(deckId)
	return true
}

/**
 * Check if the broadcaster's intent (seek/play action) actually changed.
 * Returns true only when the broadcaster did something new (seeked, changed track timing,
 * toggled play/pause). Periodic polls with the same intent are ignored.
 * @param {number} deckId
 * @param {{seeked_at?: string|null, track_played_at?: string|null, is_playing?: boolean, seek_position?: number|null}} state
 */
function hasIntentChanged(deckId, state) {
	const prev = lastSeekIntent.get(deckId)
	const intent = {
		seeked_at: state.seeked_at ?? null,
		track_played_at: state.track_played_at ?? null,
		is_playing: state.is_playing ?? false,
		seek_position: state.seek_position ?? null
	}
	if (!prev) {
		lastSeekIntent.set(deckId, intent)
		return true
	}
	// Detect actual broadcaster actions: new seek, new track start, or play/pause toggle
	const changed =
		prev.seeked_at !== intent.seeked_at ||
		prev.track_played_at !== intent.track_played_at ||
		prev.is_playing !== intent.is_playing
	if (changed) {
		lastSeekIntent.set(deckId, intent)
	}
	return changed
}

function shouldApplySeek(deckId, targetSeconds) {
	// Position tolerance — if already close enough, no need to seek
	const mediaEl = getMediaPlayer(deckId)
	if (mediaEl && typeof mediaEl.currentTime === 'number') {
		if (Math.abs(mediaEl.currentTime - targetSeconds) < 2) return false
	}
	// Time throttle — don't seek the same deck more than once per 3 seconds
	const last = lastAppliedSeek.get(deckId)
	const now = Date.now()
	if (last && now - last < 3000) return false
	lastAppliedSeek.set(deckId, now)
	return true
}

/**
 * @param {number} deckId
 * @param {import('$lib/types').Broadcast} broadcast
 */
async function playBroadcastTrack(deckId, broadcast) {
	const {track_id, channel_id} = broadcast
	if (!track_id) return false

	// Check if track is already loaded
	let track = tracksCollection.get(track_id)
	if (!track) {
		// Track not loaded - fetch it directly by ID
		try {
			const {data, error} = await sdk.tracks.readTrack(track_id)
			if (error || !data) throw new Error(`Track ${track_id} not found`)
			// await tracksCollection.preload()
			tracksCollection.utils.writeUpsert(/** @type {import('$lib/types').Track} */ (data))
			track = /** @type {import('$lib/types').Track} */ (data)
		} catch (error) {
			log.error(`play failed:`, /** @type {Error} */ (error).message)
			return false
		}
	}

	const seekTime = calculateSeekTime(broadcast, track)
	// Ensure autoplay can start from a user-initiated join
	setUserInitiatedPlay(deckId, true)
	await playTrack(deckId, track_id, null, 'broadcast_sync')
	if (seekTime !== undefined) {
		const seekJobId = nextSeekJobId(deckId)
		await seekWhenReady(deckId, seekTime, seekJobId)
		log.log(`seek +${seekTime}s`)
	}
	const deck = appState.decks[deckId]
	if (deck) {
		deck.listening_to_channel_id = channel_id
		if (broadcast.track_played_at) deck.track_played_at = broadcast.track_played_at
		if (broadcast.seeked_at) deck.seeked_at = broadcast.seeked_at
		if (broadcast.seek_position != null) deck.seek_position = broadcast.seek_position
		if (typeof broadcast.volume === 'number') deck.volume = broadcast.volume
		if (typeof broadcast.muted === 'boolean') deck.muted = broadcast.muted
		if (typeof broadcast.is_playing === 'boolean') deck.is_playing = broadcast.is_playing
		if (typeof broadcast.speed === 'number') deck.speed = broadcast.speed

		// Apply to media element — delay slightly so YouTube has time to initialize after load
		const applyToMedia = () => {
			const mediaEl = getMediaPlayer(deckId)
			if (!mediaEl) return
			if (typeof broadcast.volume === 'number') mediaEl.volume = broadcast.volume
			if (typeof broadcast.muted === 'boolean') mediaEl.muted = broadcast.muted
			if (typeof broadcast.is_playing === 'boolean') {
				if (broadcast.is_playing && mediaEl.paused) mediaEl.play()
				if (!broadcast.is_playing && !mediaEl.paused) mediaEl.pause()
			}
			if (typeof broadcast.speed === 'number' && 'playbackRate' in mediaEl) mediaEl.playbackRate = broadcast.speed
		}
		applyToMedia()
		// Re-apply after a short delay — YouTube resets playbackRate on video load
		setTimeout(applyToMedia, 1000)
	}
	return true
}

function getSortedDeckIds() {
	return Object.keys(appState.decks)
		.map(Number)
		.sort((a, b) => a - b)
}

function getBroadcastDeckState() {
	// Mirror the broadcaster workspace: send all local (non-listener) decks.
	// Previous channel/track-based filtering could drop some open decks, causing
	// listeners to open fewer decks than the broadcaster.
	let ids = getSortedDeckIds().filter((id) => !appState.decks[id]?.listening_to_channel_id)
	if (!ids.length && appState.decks[appState.active_deck_id]) {
		ids = [appState.active_deck_id]
	}
	return ids.map((id, index) => {
		const deck = appState.decks[id]
		return {
			index,
			track_id: deck?.playlist_track ?? null,
			track_played_at: deck?.track_played_at ?? null,
			is_playing: deck?.is_playing ?? false,
			seeked_at: deck?.seeked_at ?? null,
			seek_position: deck?.seek_position ?? null,
			volume: deck?.volume ?? 0,
			muted: deck?.muted ?? false,
			speed: deck?.speed ?? 1
		}
	})
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const tableWriteTimers = new Map()
const TABLE_WRITE_INTERVAL_MS = 15000

function broadcastStateUpdate(channelId) {
	const state = getBroadcastDeckState()
	const entry = broadcastStateChannels.get(channelId)
	if (!entry) return
	const seq = (broadcastStateSeqByChannel.get(channelId) ?? 0) + 1
	broadcastStateSeqByChannel.set(channelId, seq)
	console.info('[broadcast] state_send', {channelId, decks: state.length, speeds: state.map((d) => d.speed)})
	entry.channel.send({
		type: 'broadcast',
		event: 'state',
		payload: {channel_id: channelId, decks: state, seq}
	})

	// Debounced table write so late joiners get a fresh snapshot
	if (!tableWriteTimers.has(channelId)) {
		tableWriteTimers.set(
			channelId,
			setTimeout(() => {
				tableWriteTimers.delete(channelId)
				upsertRemoteBroadcast(channelId).catch((err) => {
					log.warn('table_write_failed', {channelId, error: /** @type {Error} */ (err).message})
				})
			}, TABLE_WRITE_INTERVAL_MS)
		)
	}
}

function startBroadcastState(channelId) {
	if (broadcastStateChannels.has(channelId)) return
	const channel = sdk.supabase
		.channel(`broadcast-state:${channelId}`)
		.on('broadcast', {event: 'request_state'}, () => {
			console.info('[broadcast] state_request', {channelId})
			broadcastStateUpdate(channelId)
		})
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				console.info('[broadcast] state_channel_subscribed', {channelId})
				broadcastStateUpdate(channelId)
			}
		})

	const intervalId = setInterval(broadcastStateUpdate, 5000, channelId)
	broadcastStateChannels.set(channelId, {channel, intervalId})
}

function stopBroadcastState(channelId) {
	const entry = broadcastStateChannels.get(channelId)
	if (entry) {
		entry.channel.unsubscribe()
		clearInterval(entry.intervalId)
		broadcastStateChannels.delete(channelId)
	}
	const timer = tableWriteTimers.get(channelId)
	if (timer) {
		clearTimeout(timer)
		tableWriteTimers.delete(channelId)
	}
}

function startBroadcastStateListener(channelId) {
	if (broadcastStateListeners.has(channelId)) return
	const channel = sdk.supabase
		.channel(`broadcast-state:${channelId}`)
		.on('broadcast', {event: 'state'}, (payload) => {
			const seq = payload?.payload?.seq ?? payload?.seq
			if (typeof seq === 'number') {
				const lastSeq = lastReceivedStateSeqByChannel.get(channelId) ?? 0
				if (seq <= lastSeq) {
					console.info('[broadcast] state_drop_stale', {channelId, seq, lastSeq})
					return
				}
				lastReceivedStateSeqByChannel.set(channelId, seq)
			}
			const decks = payload?.payload?.decks ?? payload?.decks
			console.info('[broadcast] state_receive', {
				channelId,
				decks: Array.isArray(decks) ? decks.length : 0,
				speeds: Array.isArray(decks) ? decks.map((d) => d?.speed) : []
			})
			applyBroadcastState(channelId, decks)
		})
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				console.info('[broadcast] state_listener_subscribed', {channelId})
				channel.send({type: 'broadcast', event: 'request_state', payload: {channel_id: channelId}})
			}
		})
	broadcastStateListeners.set(channelId, channel)
}

function stopBroadcastStateListener(channelId) {
	const channel = broadcastStateListeners.get(channelId)
	if (channel) {
		channel.unsubscribe()
		broadcastStateListeners.delete(channelId)
	}
	lastReceivedStateSeqByChannel.delete(channelId)
}

function startBroadcastTableListener(channelId) {
	if (broadcastTableListeners.has(channelId)) return
	const channel = sdk.supabase
		.channel(`broadcast-table:${channelId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'broadcast',
				filter: `channel_id=eq.${channelId}`
			},
			() => {
				console.info('[broadcast] broadcast_table_change', {channelId})
				const stateChannel = broadcastStateListeners.get(channelId)
				if (stateChannel) {
					stateChannel.send({type: 'broadcast', event: 'request_state', payload: {channel_id: channelId}})
				}
			}
		)
		.subscribe()
	broadcastTableListeners.set(channelId, channel)
}

function stopBroadcastTableListener(channelId) {
	const channel = broadcastTableListeners.get(channelId)
	if (channel) {
		channel.unsubscribe()
		broadcastTableListeners.delete(channelId)
	}
}

async function applyBroadcastState(channelId, decks) {
	if (!Array.isArray(decks) || !decks.length) return

	const incomingTrackIds = new Set(decks.map((d) => d?.track_id).filter(Boolean))
	let managedIds = getSortedDeckIds().filter((id) => appState.decks[id]?.listening_to_channel_id === channelId)

	// Add managed decks if needed for this specific broadcast channel.
	while (managedIds.length < decks.length) {
		const deck = addDeck()
		deck.listening_to_channel_id = channelId
		deck.hide_queue_panel = true
		managedIds = getSortedDeckIds().filter((id) => appState.decks[id]?.listening_to_channel_id === channelId)
	}

	// Remove excess managed decks only (never touch unrelated local decks).
	let removed = false
	while (managedIds.length > decks.length) {
		const removeIdx = managedIds.findIndex((id) => {
			const d = appState.decks[id]
			return !d?.playlist_track || !incomingTrackIds.has(d.playlist_track)
		})
		const removeId = removeIdx >= 0 ? managedIds.splice(removeIdx, 1)[0] : managedIds.pop()
		if (removeId != null) removeDeck(removeId)
		managedIds = getSortedDeckIds().filter((id) => appState.decks[id]?.listening_to_channel_id === channelId)
		removed = true
	}

	// Let Svelte tear down removed deck components and their media elements
	if (removed) await tick()

	// Map broadcast state to listener decks by track_id, then fill positionally
	/** @type {Set<number>} */
	const usedIds = new Set()
	/** @type {(number | null)[]} */
	const deckForBi = new Array(decks.length).fill(null)

	// First: match by track_id so decks keep their current track
	for (let bi = 0; bi < decks.length; bi++) {
		const trackId = decks[bi]?.track_id
		if (!trackId) continue
		const match = managedIds.find((id) => !usedIds.has(id) && appState.decks[id]?.playlist_track === trackId)
		if (match != null) {
			deckForBi[bi] = match
			usedIds.add(match)
		}
	}

	// Second: fill remaining positionally
	for (let bi = 0; bi < decks.length; bi++) {
		if (deckForBi[bi] != null) continue
		const available = managedIds.find((id) => !usedIds.has(id))
		if (available != null) {
			deckForBi[bi] = available
			usedIds.add(available)
		}
	}

	// Apply state using the mapping
	for (let bi = 0; bi < decks.length; bi++) {
		const deckId = deckForBi[bi]
		if (deckId == null) continue
		const state = decks[bi]
		const deck = appState.decks[deckId]
		if (!deck) continue

		deck.listening_to_channel_id = channelId
		if (state?.track_played_at) deck.track_played_at = state.track_played_at
		if (state?.seeked_at) deck.seeked_at = state.seeked_at
		if (state?.seek_position != null) deck.seek_position = state.seek_position
		if (typeof state?.volume === 'number') deck.volume = state.volume
		if (typeof state?.muted === 'boolean') deck.muted = state.muted
		if (typeof state?.is_playing === 'boolean') deck.is_playing = state.is_playing
		if (typeof state?.speed === 'number') deck.speed = state.speed
		if (!state?.track_id) {
			deck.playlist_track = undefined
			deck.is_playing = false
			continue
		}
		const trackChanged = deck.playlist_track !== state.track_id || deck.listening_to_channel_id !== channelId
		if (trackChanged) {
			playBroadcastTrack(deckId, {
				channel_id: channelId,
				track_id: state.track_id,
				track_played_at: state.track_played_at,
				seeked_at: state.seeked_at,
				seek_position: state.seek_position,
				is_playing: state.is_playing,
				volume: state.volume,
				muted: state.muted,
				speed: state.speed
			})
		} else {
			const mediaEl = getMediaPlayer(deckId)
			if (mediaEl) {
				if (typeof state?.volume === 'number') mediaEl.volume = state.volume
				if (typeof state?.muted === 'boolean') mediaEl.muted = state.muted
				if (typeof state?.is_playing === 'boolean') {
					if (state.is_playing && mediaEl.paused) mediaEl.play()
					if (!state.is_playing && !mediaEl.paused) mediaEl.pause()
				}
				if (typeof state?.speed === 'number' && 'playbackRate' in mediaEl) mediaEl.playbackRate = state.speed
			}
			// Only seek when broadcaster's intent changed (new seek, play/pause toggle, new track start).
			// Periodic polls with the same intent are skipped to prevent seek loops.
			if (hasIntentChanged(deckId, state)) {
				const track = tracksCollection.get(state.track_id)
				if (track) {
					const seekTime = calculateSeekTime(state, track)
					if (seekTime !== undefined && shouldApplySeek(deckId, seekTime)) {
						const seekJobId = nextSeekJobId(deckId)
						void seekWhenReady(deckId, seekTime, seekJobId)
					}
				}
			}
		}
	}
}

/** Validate that listening_to_channel_id points to an active broadcast (checks all decks) */
export async function validateListeningState() {
	for (const deck of Object.values(appState.decks)) {
		if (!deck.listening_to_channel_id) continue

		try {
			const {data} = await sdk.supabase
				.from('broadcast')
				.select('channel_id')
				.eq('channel_id', deck.listening_to_channel_id)
				.single()

			if (!data) {
				deck.listening_to_channel_id = undefined
			}
		} catch {
			deck.listening_to_channel_id = undefined
		}
	}
}
