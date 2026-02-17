import {tick} from 'svelte'
import {goto} from '$app/navigation'
import {appState, addDeck} from '$lib/app-state.svelte'
import {LOCAL_STORAGE_KEYS, IDB_DATABASES} from '$lib/storage-keys'
import {leaveBroadcast, notifyBroadcastState, upsertRemoteBroadcast, getBroadcastingChannelId} from '$lib/broadcast'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {shuffleArray} from '$lib/utils.ts'
import {
	queueInsertManyAfter,
	queueNext,
	queuePrev,
	queueRemove,
	queueShuffleKeepCurrent,
	queueRotate
} from '$lib/player/queue'
import {tracksCollection, addPlayHistoryEntry, endPlayHistoryEntry, ensureTracksLoaded} from '$lib/tanstack/collections'

const log = logger.ns('api').seal()

/** Sort tracks by created_at descending (newest first) */
const sortByNewest = (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

/**
 * @typedef {object} User
 * @prop {string} id
 * @prop {string} email
 */

/** @type {Map<number, boolean>} */
const userInitiatedPlayMap = new Map()

/** Get the user-initiated play flag for a deck */
export function getUserInitiatedPlay(deckId) {
	return userInitiatedPlayMap.get(deckId) ?? false
}

/** Set the user-initiated play flag for a deck */
export function setUserInitiatedPlay(deckId, value) {
	userInitiatedPlayMap.set(deckId, value)
}

/**
 * Find the media player element for a given deck.
 * @param {number} deckId
 * @returns {HTMLElement & {paused: boolean, play(): Promise<void> | void, pause(): void, currentTime: number, duration: number, volume: number, muted: boolean} | null}
 */
export function getMediaPlayer(deckId) {
	return /** @type {any} */ (
		document.querySelector(`[data-deck="${deckId}"] youtube-video`) ||
			document.querySelector(`[data-deck="${deckId}"] soundcloud-player`) ||
			document.querySelector(`[data-deck="${deckId}"] audio.native-audio-player`)
	)
}

/**
 * Wait until a media element exists for a deck.
 * @param {number} deckId
 * @param {number} [timeoutMs]
 */
async function waitForMediaPlayer(deckId, timeoutMs = 3000) {
	const deadline = performance.now() + timeoutMs
	while (performance.now() < deadline) {
		const player = getMediaPlayer(deckId)
		if (player && 'paused' in player) return /** @type {MediaPlayer} */ (player)
		await new Promise((r) => requestAnimationFrame(r))
	}
	return null
}

export async function checkUser() {
	try {
		log.log('checkUser')
		const {data: userData, error: userError} = await sdk.supabase.auth.getUser()
		if (userError || !userData?.user) {
			appState.channels = []
			appState.channel = undefined
			for (const deck of Object.values(appState.decks)) {
				deck.broadcasting_channel_id = undefined
			}
			return null
		}
		const user = userData.user

		const {data: channels, error: channelsError} = await sdk.channels.readUserChannels()
		if (channelsError) throw channelsError

		// Store IDs - collection handles fetching when needed
		appState.channels = channels.map((c) => c.id)
		appState.channel = /** @type {import('$lib/types').Channel | undefined} */ (channels[0])

		return user
	} catch (err) {
		log.warn('check_user_error', err)
	}
}

/**
 * @param {number} deckId
 * @param {string} id
 * @param {import('$lib/types').PlayEndReason | null} endReason - why was the previous (if any) track stopped?
 * @param {import('$lib/types').PlayStartReason} startReason - why was this track played?
 */
export async function playTrack(deckId, id, endReason, startReason) {
	log.log('play_track', {deckId, id, endReason, startReason})
	let deck = appState.decks[deckId]
	if (!deck) {
		// Auto-create deck when all decks have been closed
		deck = addDeck()
		deckId = deck.id
		appState.active_deck_id = deckId
		log.log('play_track_created_deck', {deckId})
	}

	const track = tracksCollection.get(id) ?? tracksCollection.state.get(id)
	if (!track) {
		log.warn('play_track_not_loaded', {id})
		deck.playlist_track = undefined
		return
	}

	// If same track is already loaded, just ensure it's playing (don't reload)
	if (deck.playlist_track === id && startReason === 'user_click_track') {
		log.log('play_track_same_track', {deckId, id})
		const player = await waitForMediaPlayer(deckId)
		play(deckId, player)
		return
	}

	// Set flag for user-initiated playback (respects autoplay setting for fresh decks)
	const userInitiatedReasons = ['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search']
	if (userInitiatedReasons.includes(startReason)) {
		const deckAlreadyPlaying = deck.is_playing || deck.playlist_track
		if (appState.autoplay_new_deck || deckAlreadyPlaying) {
			setUserInitiatedPlay(deckId, true)
		}
	}

	// Build playlist from tracks already loaded in collection (same channel/slug)
	const channelTracks = [...tracksCollection.state.values()].filter((t) => t?.slug === track.slug).sort(sortByNewest)
	const ids = channelTracks.map((t) => t.id)

	// Record play history
	const previousTrackId = deck.playlist_track
	if (previousTrackId && previousTrackId !== id && endReason) {
		const mediaController = document.querySelector(`media-controller#r5-deck-${deckId}`)
		const actualPlayTime = mediaController?.getAttribute('mediacurrenttime')
		const msPlayed = actualPlayTime ? Math.round(Number.parseFloat(actualPlayTime) * 1000) : 0
		endPlayHistoryEntry(previousTrackId, {ms_played: msPlayed, reason_end: endReason})
	}
	if (startReason && track.slug) {
		addPlayHistoryEntry(track, {reason_start: startReason, shuffle: deck.shuffle})
	}

	deck.playlist_track = id
	deck.playlist_slug = track.slug ?? undefined
	if (startReason !== 'broadcast_sync') {
		deck.track_played_at = new Date().toISOString()
		deck.seeked_at = deck.track_played_at
		deck.seek_position = 0
	}
	if (!deck.playlist_tracks.length || !deck.playlist_tracks.includes(id)) await setPlaylist(deckId, ids)

	// Auto-update broadcast if currently broadcasting
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId && startReason !== 'broadcast_sync') {
		try {
			await upsertRemoteBroadcast(broadcastingChannelId)
			notifyBroadcastState(broadcastingChannelId)
			log.log('broadcast_auto_updated', {
				channelId: broadcastingChannelId,
				trackId: id,
				startReason
			})
		} catch (error) {
			log.error('broadcast_auto_update_failed', {
				channelId: broadcastingChannelId,
				trackId: id,
				error: /** @type {Error} */ (error).message
			})
		}
	}

	// Wait for Svelte to update the DOM (render the player element) before calling play
	await tick()
	const player = await waitForMediaPlayer(deckId)
	log.debug('playTrack calling play()', {deckId, foundPlayer: !!player})
	// Apply volume before playing to avoid audible flash at wrong volume
	if (player) {
		player.volume = deck.volume
		player.muted = deck.volume === 0 ? true : (deck.muted ?? false)
	}
	play(deckId, player)
}

/**
 * @param {number} deckId
 * @param {{id: string, slug: string}} channel
 * @param {string} [trackId] - optional track ID to start from
 */
export async function playChannel(deckId, {id, slug}, trackId) {
	log.log('play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()].filter((t) => t?.slug === slug).sort(sortByNewest)
	if (!tracks.length) {
		log.warn('play_channel_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	await setPlaylist(deckId, ids)
	await playTrack(deckId, trackId ?? ids[0], null, 'play_channel')
}

/**
 * @param {string} trackId
 * @param {string} [slug]
 */
export async function playTrackInNewDeck(trackId, slug) {
	const deck = addDeck()
	appState.active_deck_id = deck.id
	if (slug && !(tracksCollection.get(trackId) ?? tracksCollection.state.get(trackId))) {
		await ensureTracksLoaded(slug)
	}
	await playTrack(deck.id, trackId, null, 'user_click_track')
}

/**
 * @param {{id: string, slug: string}} channel
 * @param {string} [trackId]
 */
export async function playChannelInNewDeck(channel, trackId) {
	const deck = addDeck()
	appState.active_deck_id = deck.id
	await playChannel(deck.id, channel, trackId)
}

/**
 * Play channel starting from random track with shuffle enabled
 * @param {number} deckId
 * @param {{id: string, slug: string}} channel
 */
export async function shufflePlayChannel(deckId, {id, slug}) {
	log.log('shuffle_play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
	if (!tracks.length) {
		log.warn('shuffle_play_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	const randomIndex = Math.floor(Math.random() * ids.length)
	await setPlaylist(deckId, ids)
	const deck = appState.decks[deckId]
	if (deck) deck.shuffle = true
	await playTrack(deckId, ids[randomIndex], null, 'play_channel')
}

/**
 * @param {number} deckId
 * @param {string[]} trackIds
 * @param {{title?: string}} [options]
 */
export function setPlaylist(deckId, trackIds, options = {}) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.playlist_tracks = trackIds
	deck.playlist_tracks_shuffled = shuffleArray(trackIds)
	const nextTitle = options.title?.trim()
	deck.playlist_title = nextTitle || undefined
}

/**
 * @param {number} deckId
 * @param {string[]} trackIds
 */
export function addToPlaylist(deckId, trackIds) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const currentTracks = deck.playlist_tracks || []
	deck.playlist_tracks = [...currentTracks, ...trackIds]

	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = shuffleArray(deck.playlist_tracks)
	}
}

/**
 * Queue track(s) to play after the current track
 * @param {number} deckId
 * @param {string | string[]} trackIds
 */
export function playNext(deckId, trackIds) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const ids = Array.isArray(trackIds) ? trackIds : [trackIds]
	const currentId = deck.playlist_track
	if (!currentId) {
		deck.playlist_tracks = ids
		return
	}
	deck.playlist_tracks = queueInsertManyAfter(deck.playlist_tracks, currentId, ids)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueInsertManyAfter(deck.playlist_tracks_shuffled, currentId, ids)
	}
	log.log('play_next', {deckId, ids, after: currentId})
}

/**
 * Remove track from queue
 * @param {number} deckId
 * @param {string} trackId
 */
export function removeFromQueue(deckId, trackId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.playlist_tracks = queueRemove(deck.playlist_tracks, trackId)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueRemove(deck.playlist_tracks_shuffled, trackId)
	}
	log.log('remove_from_queue', {deckId, trackId})
}

export function toggleTheme() {
	const isDark = document.documentElement.classList.contains('dark')
	document.documentElement.classList.toggle('dark', !isDark)
	document.documentElement.classList.toggle('light', isDark)
	appState.theme = isDark ? 'light' : 'dark'
}

/** @param {number} deckId */
export function toggleQueuePanel(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.hide_queue_panel = !deck.hide_queue_panel
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/** @param {number} deckId */
export function toggleVideoPlayer(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.hide_video_player = !deck.hide_video_player
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/** @param {number} deckId */
export function toggleDeckCompact(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.compact = !deck.compact
	if (deck.compact && deck.expanded) deck.expanded = false
}

/** @param {number} deckId */
export function togglePlayerExpanded(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.expanded = !deck.expanded
	if (deck.expanded && deck.compact) deck.compact = false
	if (deck.expanded && deck.hide_video_player) {
		deck.hide_video_player = false
	}
}

/** @param {KeyboardEvent} [event] */
export function openSearch(event) {
	event?.preventDefault()
	const searchInput = document.querySelector('input[type="search"]')
	if (searchInput instanceof HTMLInputElement && searchInput.checkVisibility()) {
		searchInput.focus()
	} else {
		goto('/search')
	}
}

/** @param {number} deckId */
export function togglePlayPause(deckId) {
	const player = getMediaPlayer(deckId)
	const deck = appState.decks[deckId]
	if (player) {
		if (player.paused) {
			if (deck) deck.is_playing = true
			player.play()
		} else {
			if (deck) deck.is_playing = false
			player.pause()
		}
	}
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/**
 * Play from this track to end of list
 * @param {number} deckId
 * @param {string} trackId
 */
export function playFromHere(deckId, trackId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const idx = deck.playlist_tracks.indexOf(trackId)
	if (idx === -1) return
	const fromHere = deck.playlist_tracks.slice(idx)
	deck.playlist_tracks = fromHere
	deck.playlist_tracks_shuffled = shuffleArray(fromHere)
	playTrack(deckId, trackId, null, 'user_click_track')
	log.log('play_from_here', {deckId, trackId, remaining: fromHere.length})
}

/**
 * Clear the queue but keep current track
 * @param {number} deckId
 */
export function clearQueue(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const current = deck.playlist_track
	if (current) {
		deck.playlist_tracks = [current]
		deck.playlist_tracks_shuffled = [current]
	} else {
		deck.playlist_tracks = []
		deck.playlist_tracks_shuffled = []
	}
	log.log('clear_queue', {deckId, kept: current})
}

/**
 * Toggle shuffle mode on/off
 * @param {number} deckId
 */
export function toggleShuffle(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.shuffle = !deck.shuffle
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = shuffleArray(deck.playlist_tracks || [])
	}
}

/**
 * Shuffle remaining tracks in place
 * @param {number} deckId
 */
export function shuffleRemaining(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const current = deck.playlist_track
	if (!current) return
	deck.playlist_tracks = queueShuffleKeepCurrent(deck.playlist_tracks, current)
	deck.playlist_tracks_shuffled = queueShuffleKeepCurrent(deck.playlist_tracks_shuffled, current)
	log.log('shuffle_remaining', {deckId, current})
}

/**
 * Rotate queue: move played tracks to end
 * @param {number} deckId
 */
export function rotateQueue(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	const current = deck.playlist_track
	if (!current) return
	deck.playlist_tracks = queueRotate(deck.playlist_tracks, current)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueRotate(deck.playlist_tracks_shuffled, current)
	}
	log.log('rotate_queue', {deckId, current})
}

/** @typedef {HTMLElement & {paused: boolean, play(): Promise<void> | void, pause(): void, currentTime: number, duration: number, volume: number, muted: boolean}} MediaPlayer */

/**
 * @param {number} deckId
 * @param {MediaPlayer | null} [player]
 */
export function play(deckId, player) {
	const deck = appState.decks[deckId]
	if (!player) {
		const el = getMediaPlayer(deckId)
		if (el && 'paused' in el) player = /** @type {MediaPlayer} */ (el)
	}
	if (!player) {
		log.warn('Media player not ready')
		return Promise.reject(new Error('Media player not ready'))
	}
	log.debug('play() check', player, 'paused?', player.paused)
	const result = player.play()
	if (result instanceof Promise) {
		return result
			.then(() => {
				if (deck) deck.is_playing = true
				log.log('play() succeeded')
				const broadcastingChannelId = getBroadcastingChannelId()
				if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
			})
			.catch((error) => {
				if (deck) deck.is_playing = false
				log.warn('play() was prevented:', error.message || error)
				throw error
			})
	}
	if (deck) deck.is_playing = true
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	return Promise.resolve()
}

/** @param {MediaPlayer} player */
export function pause(player) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	player.pause()
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/** @param {MediaPlayer} player */
export function togglePlay(player) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	if (player.paused) {
		// play() needs deckId but togglePlay gets a player ref directly from component
		// The component will use its own deckId-scoped play call
		player.play()
	} else {
		pause(player)
	}
}

/**
 * @param {number} deckId
 * @param {number} seconds
 */
export function seekTo(deckId, seconds) {
	const mediaEl = getMediaPlayer(deckId)
	if (!mediaEl) {
		log.warn('seekTo: no media element found')
		return
	}
	mediaEl.currentTime = seconds
	const deck = appState.decks[deckId]
	if (deck) {
		deck.seeked_at = new Date().toISOString()
		deck.seek_position = seconds
	}
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/**
 * @param {number} deckId
 * @param {import('$lib/types').Track | undefined} track
 * @param {string[]} activeQueue
 * @param {import('$lib/types').PlayEndReason} endReason
 */
export function next(deckId, track, activeQueue, endReason) {
	if (!track?.id) {
		log.warn('No current track')
		return
	}
	if (!activeQueue?.length) {
		log.warn('No active queue')
		return
	}
	const nextId = queueNext(activeQueue, track.id)
	if (nextId) {
		/** @type {import('$lib/types').PlayStartReason} */
		const startReason = endReason === 'youtube_error' ? 'track_error' : 'auto_next'
		playTrack(deckId, nextId, endReason, startReason)
	} else if (activeQueue.length > 0) {
		log.info('Queue ended: looping to start')
		playTrack(deckId, activeQueue[0], endReason, 'auto_next')
	} else {
		log.info('No next track available')
	}
}

/**
 * @param {number} deckId
 * @param {import('$lib/types').Track | undefined} track
 * @param {string[]} activeQueue
 * @param {import('$lib/types').PlayEndReason} endReason
 */
export function previous(deckId, track, activeQueue, endReason) {
	if (!track?.id) {
		log.warn('No current track')
		return
	}
	if (!activeQueue?.length) {
		log.warn('No active queue')
		return
	}
	const prevId = queuePrev(activeQueue, track.id)
	if (prevId) {
		playTrack(deckId, prevId, endReason, 'user_prev')
	} else {
		log.info('No previous track available')
	}
}

/** @param {number} deckId */
export function toggleVideo(deckId) {
	const deck = appState.decks[deckId]
	if (deck) deck.hide_video_player = !deck.hide_video_player
}

/** @param {number} deckId */
export function eject(deckId) {
	const deck = appState.decks[deckId]
	if (!deck) return
	deck.playlist_track = undefined
	deck.playlist_tracks = []
	deck.playlist_tracks_shuffled = []
	deck.hide_video_player = true
	deck.shuffle = false
	deck.is_playing = false
}

/**
 * Clears all local data (localStorage and IndexedDB).
 * Remote Radio4000 account data remains intact.
 * Typically followed by a page reload.
 */
export function resetLocalData() {
	for (const key of Object.values(LOCAL_STORAGE_KEYS)) {
		localStorage.removeItem(key)
	}
	for (const db of Object.values(IDB_DATABASES)) {
		indexedDB.deleteDatabase(db)
	}
}
