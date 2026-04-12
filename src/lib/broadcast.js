import {tick} from 'svelte'
import {
	playTrack,
	play,
	seekTo,
	setUserInitiatedPlay,
	clearUserInitiatedPlay,
	getMediaPlayer,
	applyRemoteState
} from '$lib/api'
import {appState, addDeck, removeDeck} from '$lib/app-state.svelte'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {broadcastsCollection} from '$lib/collections/broadcasts'
import {channelsCollection} from '$lib/collections/channels'
import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'
import {isDbId} from '$lib/utils'
import {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '$lib/player/broadcast-utils'
export {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '$lib/player/broadcast-utils'
import {capture} from '$lib/analytics'

/** @typedef {import('$lib/types').Broadcast} Broadcast */
/** @typedef {import('$lib/types').BroadcastDeckState} BroadcastDeckState */

const log = logger.ns('broadcast').seal()
const RE_YT_PARAM = /[?&]v=([^&]+)/
const RE_YT_SHORT = /youtu\.be\/([^?]+)/
const BROADCAST_IDLE_STOP_MS = 10000
const BROADCAST_LIVENESS_INTERVAL_MS = 1000

/** Extract type-validated broadcast fields for deck state */
function pickBroadcastFields(broadcast) {
	/** @type {Partial<import('$lib/types').Deck>} */
	const fields = {}
	if (broadcast.track_played_at) fields.track_played_at = broadcast.track_played_at
	if (broadcast.seeked_at) fields.seeked_at = broadcast.seeked_at
	if (broadcast.seek_position != null) fields.seek_position = broadcast.seek_position
	if (typeof broadcast.volume === 'number') fields.volume = broadcast.volume
	if (typeof broadcast.muted === 'boolean') fields.muted = broadcast.muted
	if (typeof broadcast.is_playing === 'boolean') fields.is_playing = broadcast.is_playing
	if (typeof broadcast.speed === 'number') fields.speed = broadcast.speed
	return fields
}

/** Get slug for a channel ID, or short ID if not found */
function label(channelId) {
	return channelsCollection.get(channelId)?.slug || channelId?.slice(0, 8)
}

/** Compact one-line summary of deck states for logging */
function deckSummary(decks) {
	if (!Array.isArray(decks) || !decks.length) return '[]'
	return decks
		.map((d) => {
			const parts = []
			parts.push(d.is_playing ? '▶' : '⏸')
			if (d.seek_position != null) parts.push(`seek:${Math.round(d.seek_position)}s`)
			if (typeof d.volume === 'number') parts.push(`vol:${d.volume}`)
			if (typeof d.speed === 'number' && d.speed !== 1) parts.push(`${d.speed}x`)
			if (d.muted) parts.push('muted')
			return parts.join(' ')
		})
		.join(' | ')
}

/** Log only when the message differs from the last one for this key */
const _lastLogged = new Map()
function logDedup(key, msg) {
	if (_lastLogged.get(key) === msg) return
	_lastLogged.set(key, msg)
	log.debug(msg)
}

/** Supabase realtime channels keyed by deckId
 * @type {Map<number, any>}
 */
const broadcastChannels = new Map()

/** Broadcaster realtime state channels keyed by channelId
 * @type {Map<string, {channel: any, intervalId: ReturnType<typeof setInterval>}>}
 */
const broadcastStateChannels = new Map()
/** Broadcaster cleanup monitors keyed by channelId
 * @type {Map<string, {intervalId: ReturnType<typeof setInterval>, idleSinceMs: number | null, stopping: boolean}>}
 */
const broadcastLivenessMonitors = new Map()

/** Listener realtime state channels keyed by channelId
 * @type {Map<string, any>}
 */
const broadcastStateListeners = new Map()

/** Broadcast table listeners keyed by channelId (for state refresh)
 * @type {Map<string, any>}
 */
const broadcastTableListeners = new Map()
const broadcastStateSeqByChannel = new Map()
const lastReceivedStateSeqByChannel = new Map()
const seekJobSeqByDeck = new Map()

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
	return Object.values(appState.decks).find((deck) => deck.broadcasting_channel_id)
		?.broadcasting_channel_id
}

/**
 * @param {number} deckId
 * @param {string} channelId
 */
export async function joinBroadcast(deckId, channelId) {
	log.log(`joinBroadcast @${label(channelId)} deck:${deckId}`)
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

		const {data} = /** @type {{data: Broadcast}} */ (
			await sdk.supabase
				.from('broadcast')
				.select('*')
				.eq('channel_id', channelId)
				.single()
				.throwOnError()
		)

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
			clearUserInitiatedPlay(id)
			removeDeck(id)
		}

		// Use decks jsonb if available (multi-deck), fall back to single-deck fields
		if (Array.isArray(data?.decks) && data.decks.length) {
			await applyBroadcastState(channelId, data.decks)
		} else if (data?.track_id) {
			const deck = addDeck()
			deck.compact = true
			deck.listening_to_channel_id = channelId
			deck.hide_queue_panel = true
			await playBroadcastTrack(deck.id, data)
		}

		// Set active deck to the first listener deck
		const listenerIds = getSortedDeckIds().filter(
			(id) => appState.decks[id]?.listening_to_channel_id === channelId
		)
		if (listenerIds.length) {
			appState.active_deck_id = listenerIds[0]
		}

		startBroadcastStateListener(channelId)
		startBroadcastTableListener(channelId)
		capture('broadcast:channel_join', {channel_slug: label(channelId)})
		log.log(`joined ${label(channelId)} on ${listenerIds.length} deck(s)`)
	} catch (error) {
		log.error(`join failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
	}
}

/**
 * Re-sync a single listening deck to the current broadcast state without
 * rebuilding the local listener deck layout.
 * @param {number} deckId
 */
export async function resyncBroadcastDeck(deckId) {
	const deck = appState.decks[deckId]
	const channelId = deck?.listening_to_channel_id
	if (!channelId) return

	log.log(`resyncBroadcastDeck @${label(channelId)} deck:${deckId}`)

	/** @type {BroadcastDeckState[] | null | undefined} */
	let decks = broadcastsCollection.state.get(channelId)?.decks
	if (!Array.isArray(decks) || !decks.length) {
		try {
			const {data} = /** @type {{data: Broadcast}} */ (
				await sdk.supabase
					.from('broadcast')
					.select('*')
					.eq('channel_id', channelId)
					.single()
					.throwOnError()
			)
			decks = data?.decks
		} catch (error) {
			log.error(`resync failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
			return
		}
	}
	if (!Array.isArray(decks) || !decks.length) return

	const localManagedIds = getSortedDeckIds().filter(
		(id) => appState.decks[id]?.listening_to_channel_id === channelId
	)
	const localIndex = Math.max(0, localManagedIds.indexOf(deckId))
	const matchedState =
		(deck.playlist_track && decks.find((state) => state?.track_id === deck.playlist_track)) ??
		decks[localIndex] ??
		decks[0]
	if (!matchedState) return

	await syncDeckToBroadcastState(deckId, channelId, matchedState)
}

/** @param {number} deckId */
export function leaveBroadcast(deckId) {
	const channelId = appState.decks[deckId]?.listening_to_channel_id
	stopBroadcastSync(deckId)
	if (channelId) {
		stopBroadcastStateListener(channelId)
		stopBroadcastTableListener(channelId)
		closeListeningDecksForChannel(channelId)
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
	const deckState = getBroadcastDeckState()
	const firstTrackId = deckState?.[0]?.track_id ?? null
	// track_id column is a UUID — use nil UUID for ephemeral tracks (decks JSON has the data)
	const dbTrackId = isDbId(firstTrackId)
		? /** @type {string} */ (firstTrackId)
		: '00000000-0000-0000-0000-000000000000'
	return sdk.supabase
		.from('broadcast')
		.upsert(
			{
				channel_id: channelId,
				track_id: dbTrackId,
				track_played_at: new Date().toISOString(),
				decks: deckState
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
	log.log(`startBroadcast @${label(channelId)}`)
	if (!trackId) {
		log.log(`skipped ${label(channelId)} (no track)`)
		return
	}
	const slug = channelsCollection.state.get(channelId)?.slug
	if (slug) await ensureTracksLoaded(slug)
	await upsertRemoteBroadcast(channelId)
	startBroadcastState(channelId)
	broadcastStateUpdate(channelId)
	capture('broadcast:channel_start', {channel_slug: label(channelId)})
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
		capture('broadcast:channel_end', {channel_slug: label(channelId)})
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
	seekJobSeqByDeck.delete(deckId)
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
 * @param {number} deckId
 * @param {Partial<BroadcastDeckState> & {channel_id: string, track_id?: string | null, track_url?: string | null, track_title?: string | null, track_media_id?: string | null}} broadcast
 */
async function playBroadcastTrack(deckId, broadcast) {
	const {track_id, channel_id} = broadcast
	if (!track_id) return false

	// Check if track is already loaded; if not, reconstruct from broadcast-included data
	/** @type {import('$lib/types').Track | undefined} */
	let track = tracksCollection.get(track_id)
	if (!track) {
		if (broadcast.track_url) {
			const uri = broadcast.track_url
			const ytId =
				uri.match(RE_YT_PARAM)?.[1] ??
				uri.match(RE_YT_SHORT)?.[1] ??
				broadcast.track_media_id ??
				null
			const now = new Date().toISOString()
			track = /** @type {import('$lib/types').Track} */ ({
				id: track_id,
				url: uri,
				title: broadcast.track_title ?? track_id,
				media_id: ytId,
				created_at: now,
				updated_at: now,
				slug: null
			})
			tracksCollection.utils.writeUpsert(track)
			log.log('play_broadcast_ephemeral', {track_id, url: uri})
		} else {
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
	}
	if (!track) return false

	const seekTime = calculateSeekTime(broadcast, track)
	// Ensure autoplay can start from a user-initiated join
	setUserInitiatedPlay(deckId, true)
	await playTrack(deckId, track_id, null, 'broadcast_sync')
	if (seekTime !== undefined) {
		const seekJobId = nextSeekJobId(deckId)
		await seekWhenReady(deckId, seekTime, seekJobId)
		log.log(`seek +${seekTime}s`)
	}
	if (appState.decks[deckId]) {
		applyRemoteState(deckId, {
			listening_to_channel_id: channel_id,
			listening_drifted: false,
			...pickBroadcastFields(broadcast)
		})

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
			if (typeof broadcast.speed === 'number' && 'playbackRate' in mediaEl)
				mediaEl.playbackRate = broadcast.speed
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

function getBroadcasterDeckIds() {
	return getSortedDeckIds().filter((id) => !appState.decks[id]?.listening_to_channel_id)
}

function startBroadcastLivenessMonitor(channelId) {
	if (broadcastLivenessMonitors.has(channelId)) return
	const intervalId = setInterval(() => {
		void evaluateBroadcastLiveness(channelId)
	}, BROADCAST_LIVENESS_INTERVAL_MS)
	const monitor = {
		intervalId,
		idleSinceMs: null,
		stopping: false
	}
	broadcastLivenessMonitors.set(channelId, monitor)
}

function stopBroadcastLivenessMonitor(channelId) {
	const monitor = broadcastLivenessMonitors.get(channelId)
	if (!monitor) return
	clearInterval(monitor.intervalId)
	broadcastLivenessMonitors.delete(channelId)
}

async function evaluateBroadcastLiveness(channelId) {
	const monitor = broadcastLivenessMonitors.get(channelId)
	if (!monitor || monitor.stopping) return

	const deckIds = getBroadcasterDeckIds()
	if (!deckIds.length) {
		monitor.stopping = true
		log.log(`auto_stop_no_decks @${label(channelId)}`)
		try {
			await stopBroadcast(channelId)
		} catch (error) {
			log.warn('auto_stop_no_decks_failed', {
				channelId,
				error: /** @type {Error} */ (error).message
			})
		} finally {
			monitor.stopping = false
		}
		return
	}

	const hasPlayingTrack = deckIds.some((id) => {
		const deck = appState.decks[id]
		return Boolean(deck?.playlist_track && deck?.is_playing)
	})
	if (hasPlayingTrack) {
		monitor.idleSinceMs = null
		return
	}

	const now = Date.now()
	if (monitor.idleSinceMs == null) {
		monitor.idleSinceMs = now
		return
	}
	if (now - monitor.idleSinceMs < BROADCAST_IDLE_STOP_MS) return

	monitor.stopping = true
	log.log(`auto_stop_idle @${label(channelId)} after ${BROADCAST_IDLE_STOP_MS}ms`)
	try {
		await stopBroadcast(channelId)
	} catch (error) {
		log.warn('auto_stop_idle_failed', {
			channelId,
			error: /** @type {Error} */ (error).message
		})
		monitor.idleSinceMs = now
	} finally {
		monitor.stopping = false
	}
}

function getBroadcastDeckState() {
	// Mirror the broadcaster workspace: send all local (non-listener) decks.
	// Previous channel/track-based filtering could drop some open decks, causing
	// listeners to open fewer decks than the broadcaster.
	let ids = getBroadcasterDeckIds()
	if (!ids.length && appState.decks[appState.active_deck_id]) {
		ids = [appState.active_deck_id]
	}
	return ids.map((id, index) => {
		const deck = appState.decks[id]
		const trackId = deck?.playlist_track ?? null
		// Include non-DB track data so listeners can reconstruct tracks not in the DB
		const nonDbTrack = trackId && !isDbId(trackId) ? tracksCollection.get(trackId) : null
		return {
			index,
			track_id: trackId,
			track_played_at: deck?.track_played_at ?? null,
			is_playing: deck?.is_playing ?? false,
			seeked_at: deck?.seeked_at ?? null,
			seek_position: deck?.seek_position ?? null,
			volume: deck?.volume ?? 0,
			muted: deck?.muted ?? false,
			speed: deck?.speed ?? 1,
			// Extra fields for non-DB tracks (Discogs videos, etc.)
			track_url: nonDbTrack?.url ?? null,
			track_title: nonDbTrack?.title ?? null,
			track_media_id: nonDbTrack?.media_id ?? null
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
	logDedup(`send:${channelId}`, `state_send @${label(channelId)} ${deckSummary(state)}`)
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
			log.log(`state_request @${label(channelId)}`)
			broadcastStateUpdate(channelId)
		})
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				log.log(`state_channel_subscribed @${label(channelId)}`)
				broadcastStateUpdate(channelId)
			}
		})

	const intervalId = setInterval(broadcastStateUpdate, 5000, channelId)
	broadcastStateChannels.set(channelId, {channel, intervalId})
	startBroadcastLivenessMonitor(channelId)
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
	stopBroadcastLivenessMonitor(channelId)
}

function startBroadcastStateListener(channelId) {
	if (broadcastStateListeners.has(channelId)) return
	const channel = sdk.supabase
		.channel(`broadcast-state:${channelId}`)
		.on('broadcast', {event: 'state'}, (payload) => {
			const seq = payload?.payload?.seq ?? payload?.seq
			if (typeof seq === 'number') {
				const lastSeq = lastReceivedStateSeqByChannel.get(channelId) ?? 0
				if (seq <= lastSeq) return
				lastReceivedStateSeqByChannel.set(channelId, seq)
			}
			const decks = payload?.payload?.decks ?? payload?.decks
			logDedup(`recv:${channelId}`, `state_receive @${label(channelId)} ${deckSummary(decks)}`)
			applyBroadcastState(channelId, decks)
		})
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				log.log(`state_listener_subscribed @${label(channelId)}`)
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
			(payload) => {
				if (payload?.eventType === 'DELETE') {
					log.log(`table_delete @${label(channelId)} closing listeners`)
					stopBroadcastStateListener(channelId)
					stopBroadcastTableListener(channelId)
					closeListeningDecksForChannel(channelId)
					return
				}
				log.debug(`table_change @${label(channelId)}`)
				const stateChannel = broadcastStateListeners.get(channelId)
				if (stateChannel) {
					stateChannel.send({
						type: 'broadcast',
						event: 'request_state',
						payload: {channel_id: channelId}
					})
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

function closeListeningDecksForChannel(channelId) {
	const decksToClose = Object.entries(appState.decks)
		.filter(([, deck]) => deck.listening_to_channel_id === channelId)
		.map(([id]) => Number(id))
	for (const id of decksToClose) {
		stopBroadcastSync(id)
		clearUserInitiatedPlay(id)
		removeDeck(id)
	}
}

async function applyBroadcastState(channelId, decks) {
	if (!Array.isArray(decks) || !decks.length) return

	const incomingTrackIds = new Set(decks.map((d) => d?.track_id).filter(Boolean))
	let managedIds = getSortedDeckIds().filter(
		(id) => appState.decks[id]?.listening_to_channel_id === channelId
	)

	// Add managed decks if needed for this specific broadcast channel.
	while (managedIds.length < decks.length) {
		const deck = addDeck()
		deck.listening_to_channel_id = channelId
		deck.hide_queue_panel = true
		managedIds = getSortedDeckIds().filter(
			(id) => appState.decks[id]?.listening_to_channel_id === channelId
		)
	}

	// Remove excess managed decks only (never touch unrelated local decks).
	let removed = false
	while (managedIds.length > decks.length) {
		const removeIdx = managedIds.findIndex((id) => {
			const d = appState.decks[id]
			return !d?.playlist_track || !incomingTrackIds.has(d.playlist_track)
		})
		const removeId = removeIdx >= 0 ? managedIds.splice(removeIdx, 1)[0] : managedIds.pop()
		if (removeId != null) {
			clearUserInitiatedPlay(removeId)
			removeDeck(removeId)
		}
		managedIds = getSortedDeckIds().filter(
			(id) => appState.decks[id]?.listening_to_channel_id === channelId
		)
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
		const match = managedIds.find(
			(id) => !usedIds.has(id) && appState.decks[id]?.playlist_track === trackId
		)
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
		void syncDeckToBroadcastState(deckId, channelId, state)
	}
}

/**
 * Apply one broadcast deck state onto one local listener deck while preserving
 * local deck layout/UI fields such as compact/expanded/sidebar sizing.
 * @param {number} deckId
 * @param {string} channelId
 * @param {BroadcastDeckState | undefined | null} state
 */
async function syncDeckToBroadcastState(deckId, channelId, state) {
	const deck = appState.decks[deckId]
	if (!deck) return

	if (!state?.track_id) {
		applyRemoteState(deckId, {
			listening_to_channel_id: channelId,
			listening_drifted: false,
			playlist_track: undefined,
			is_playing: false
		})
		return
	}

	const trackChanged =
		deck.playlist_track !== state.track_id || deck.listening_to_channel_id !== channelId

	applyRemoteState(deckId, {
		listening_to_channel_id: channelId,
		listening_drifted: false,
		...pickBroadcastFields(state)
	})
	if (trackChanged) {
		await playBroadcastTrack(deckId, {
			channel_id: channelId,
			track_id: state.track_id,
			track_played_at: state.track_played_at,
			seeked_at: state.seeked_at,
			seek_position: state.seek_position,
			is_playing: state.is_playing,
			volume: state.volume,
			muted: state.muted,
			speed: state.speed,
			track_url: state.track_url,
			track_title: state.track_title,
			track_media_id: state.track_media_id
		})
		return
	}

	const mediaEl = getMediaPlayer(deckId)
	if (mediaEl) {
		if (typeof state.volume === 'number') mediaEl.volume = state.volume
		if (typeof state.muted === 'boolean') mediaEl.muted = state.muted
		if (typeof state.is_playing === 'boolean') {
			if (state.is_playing && mediaEl.paused) mediaEl.play()
			if (!state.is_playing && !mediaEl.paused) mediaEl.pause()
		}
		if (typeof state.speed === 'number' && 'playbackRate' in mediaEl) {
			mediaEl.playbackRate = state.speed
		}
	}

	const track = tracksCollection.get(state.track_id)
	if (!track) return
	const seekTime = calculateSeekTime(state, track)
	if (seekTime === undefined) return
	const alreadyClose =
		mediaEl &&
		typeof mediaEl.currentTime === 'number' &&
		Math.abs(mediaEl.currentTime - seekTime) < DRIFT_TOLERANCE_SECONDS
	if (alreadyClose) return
	const seekJobId = nextSeekJobId(deckId)
	await seekWhenReady(deckId, seekTime, seekJobId)
}

/** Validate that listening_to_channel_id points to an active broadcast (checks all decks) */
export async function validateListeningState() {
	const listeningDeckIds = Object.keys(appState.decks)
		.map(Number)
		.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	for (const id of listeningDeckIds) {
		const deck = appState.decks[id]
		if (!deck?.listening_to_channel_id) continue
		try {
			const {data} = await sdk.supabase
				.from('broadcast')
				.select('channel_id')
				.eq('channel_id', deck.listening_to_channel_id)
				.single()
			if (!data) {
				closeListeningDecksForChannel(deck.listening_to_channel_id)
			}
		} catch {
			closeListeningDecksForChannel(deck.listening_to_channel_id)
		}
	}
}
