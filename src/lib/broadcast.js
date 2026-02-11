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

		await playBroadcastTrack(deckId, data)
		startBroadcastStateListener(channelId)
		startBroadcastTableListener(channelId)
		log.log(`joined ${label(channelId)} on deck ${deckId}`)
	} catch (error) {
		log.error(`join failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
	}
}

/** @param {number} deckId */
export function leaveBroadcast(deckId) {
	stopBroadcastSync(deckId)
	const channelId = appState.decks[deckId]?.listening_to_channel_id
	if (channelId) stopBroadcastStateListener(channelId)
	if (channelId) stopBroadcastTableListener(channelId)
	for (const deck of Object.values(appState.decks)) {
		if (deck.listening_to_channel_id === channelId) {
			deck.listening_to_channel_id = undefined
			deck.is_playing = false
		}
	}
	log.log(`left deck ${deckId}`)
}

/**
 * Helper to upsert a broadcast record
 * @param {string} channelId
 * @param {string} trackId
 */
export async function upsertRemoteBroadcast(channelId, trackId) {
	return sdk.supabase
		.from('broadcast')
		.upsert(
			{
				channel_id: channelId,
				track_id: trackId,
				track_played_at: new Date().toISOString()
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
	if (isV1Track(trackId)) {
		throw new Error('This track is from a legacy channel and cannot be streamed live')
	}

	await upsertRemoteBroadcast(channelId, trackId)
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
		stopBroadcastState(channelId)
		log.log(`stopped ${label(channelId)}`)
	} catch (error) {
		log.error(`stop failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
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
			return Math.floor(base)
		}
		return Math.floor(broadcast.seek_position)
	}
	if (!broadcast.track_played_at) return undefined
	const elapsed = (Date.now() - new Date(broadcast.track_played_at).getTime()) / 1000
	if (elapsed < 0) return undefined
	if (track.duration && elapsed >= track.duration) return undefined
	return Math.floor(elapsed)
}

async function seekWhenReady(deckId, seconds) {
	const deadline = performance.now() + 8000
	let mediaEl
	while (performance.now() < deadline) {
		mediaEl = getMediaPlayer(deckId)
		if (mediaEl && typeof mediaEl.currentTime === 'number') {
			const hasDuration = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
			if (hasDuration || mediaEl.currentTime > 0) break
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	if (!mediaEl || typeof mediaEl.currentTime !== 'number') return false

	seekTo(deckId, seconds)
	play(deckId)

	let adjustTries = 10
	while (adjustTries > 0) {
		if (Math.abs(mediaEl.currentTime - seconds) < 1) return true
		seekTo(deckId, seconds)
		await new Promise((r) => setTimeout(r, 200))
		adjustTries--
	}
	return true
}

function shouldApplySeek(deckId, targetSeconds) {
	const mediaEl = getMediaPlayer(deckId)
	if (mediaEl && typeof mediaEl.currentTime === 'number') {
		if (Math.abs(mediaEl.currentTime - targetSeconds) < 1.5) return false
	}
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

	// Check if track is already loaded
	let track = tracksCollection.get(track_id)
	if (!track) {
		// Track not loaded - fetch it directly by ID
		try {
			const {data, error} = await sdk.tracks.readTrack(track_id)
			if (error || !data) throw new Error(`Track ${track_id} not found`)
			await tracksCollection.preload()
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
		await seekWhenReady(deckId, seekTime)
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
		if (typeof broadcast.show_video_player === 'boolean') deck.show_video_player = broadcast.show_video_player
		if (typeof broadcast.queue_panel_visible === 'boolean') deck.queue_panel_visible = broadcast.queue_panel_visible
		if (typeof broadcast.is_playing === 'boolean') deck.is_playing = broadcast.is_playing

		const mediaEl = getMediaPlayer(deckId)
		if (mediaEl) {
			if (typeof broadcast.volume === 'number') mediaEl.volume = broadcast.volume
			if (typeof broadcast.muted === 'boolean') mediaEl.muted = broadcast.muted
			if (typeof broadcast.is_playing === 'boolean') {
				if (broadcast.is_playing && mediaEl.paused) mediaEl.play()
				if (!broadcast.is_playing && !mediaEl.paused) mediaEl.pause()
			}
		}
	}
	return true
}

function getSortedDeckIds() {
	return Object.keys(appState.decks)
		.map(Number)
		.sort((a, b) => a - b)
}

function getBroadcastDeckState() {
	const ids = getSortedDeckIds()
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
			show_video_player: deck?.show_video_player ?? true,
			queue_panel_visible: deck?.queue_panel_visible ?? true
		}
	})
}

function broadcastStateUpdate(channelId) {
	const state = getBroadcastDeckState()
	const entry = broadcastStateChannels.get(channelId)
	if (!entry) return
	console.info('[broadcast] state_send', {channelId, decks: state.length})
	entry.channel.send({
		type: 'broadcast',
		event: 'state',
		payload: {channel_id: channelId, decks: state}
	})
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
}

function startBroadcastStateListener(channelId) {
	if (broadcastStateListeners.has(channelId)) return
	const channel = sdk.supabase
		.channel(`broadcast-state:${channelId}`)
		.on('broadcast', {event: 'state'}, (payload) => {
			const decks = payload?.payload?.decks ?? payload?.decks
			console.info('[broadcast] state_receive', {channelId, decks: Array.isArray(decks) ? decks.length : 0})
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

function applyBroadcastState(channelId, decks) {
	if (!Array.isArray(decks) || !decks.length) return

	const incomingTrackIds = new Set(decks.map((d) => d?.track_id).filter(Boolean))
	let sortedIds = getSortedDeckIds()

	// Add decks if needed
	while (sortedIds.length < decks.length) {
		addDeck()
		sortedIds = getSortedDeckIds()
	}

	// Remove excess decks — prefer removing those whose track is NOT in the incoming state
	while (sortedIds.length > decks.length) {
		const removeIdx = sortedIds.findIndex((id) => {
			const d = appState.decks[id]
			return !d?.playlist_track || !incomingTrackIds.has(d.playlist_track)
		})
		const removeId = removeIdx >= 0 ? sortedIds.splice(removeIdx, 1)[0] : sortedIds.pop()
		if (removeId != null) removeDeck(removeId)
		sortedIds = getSortedDeckIds()
	}

	// Map broadcast state to listener decks by track_id, then fill positionally
	/** @type {Set<number>} */
	const usedIds = new Set()
	/** @type {(number | null)[]} */
	const deckForBi = new Array(decks.length).fill(null)

	// First: match by track_id so decks keep their current track
	for (let bi = 0; bi < decks.length; bi++) {
		const trackId = decks[bi]?.track_id
		if (!trackId) continue
		const match = sortedIds.find((id) => !usedIds.has(id) && appState.decks[id]?.playlist_track === trackId)
		if (match != null) {
			deckForBi[bi] = match
			usedIds.add(match)
		}
	}

	// Second: fill remaining positionally
	for (let bi = 0; bi < decks.length; bi++) {
		if (deckForBi[bi] != null) continue
		const available = sortedIds.find((id) => !usedIds.has(id))
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
		if (typeof state?.show_video_player === 'boolean') deck.show_video_player = state.show_video_player
		if (typeof state?.queue_panel_visible === 'boolean') deck.queue_panel_visible = state.queue_panel_visible
		if (typeof state?.is_playing === 'boolean') deck.is_playing = state.is_playing
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
				show_video_player: state.show_video_player,
				queue_panel_visible: state.queue_panel_visible
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
			}
			if (state?.track_played_at || state?.seeked_at || state?.seek_position != null) {
				const track = tracksCollection.get(state.track_id)
				if (track) {
					const seekTime = calculateSeekTime(state, track)
					if (seekTime !== undefined && shouldApplySeek(deckId, seekTime)) {
						void seekWhenReady(deckId, seekTime)
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
