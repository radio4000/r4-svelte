import {tick} from 'svelte'
import {appState} from '$lib/app-state.svelte'
import {LOCAL_STORAGE_KEYS, IDB_DATABASES} from '$lib/storage-keys'
import {leaveBroadcast, upsertRemoteBroadcast} from '$lib/broadcast'
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

/**
 * @typedef {object} User
 * @prop {string} id
 * @prop {string} email
 */

export async function checkUser() {
	try {
		log.log('checkUser')
		const {data: userData, error: userError} = await sdk.supabase.auth.getUser()
		if (userError || !userData?.user) {
			appState.channels = []
			appState.channel = undefined
			appState.broadcasting_channel_id = undefined
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
 * @param {string} id
 * @param {import('$lib/types').PlayEndReason | null} endReason - why was the previous (if any) track stopped?
 * @param {import('$lib/types').PlayStartReason} startReason - why was this track played?
 */
export async function playTrack(id, endReason, startReason) {
	log.log('play_track', {id, endReason, startReason})

	const track = tracksCollection.get(id)
	if (!track) {
		log.warn('play_track_not_loaded', {id})
		appState.playlist_track = undefined
		return
	}

	// Set flag for user-initiated playback
	const userInitiatedReasons = ['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search']
	if (userInitiatedReasons.includes(startReason)) {
		globalThis.__userInitiatedPlay = true
	}

	// Build playlist from tracks already loaded in collection (same channel/slug)
	const channelTracks = [...tracksCollection.state.values()]
		.filter((t) => t.slug === track.slug)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
	const ids = channelTracks.map((t) => t.id)

	// Record play history
	const previousTrackId = appState.playlist_track
	if (previousTrackId && previousTrackId !== id && endReason) {
		const mediaController = document.querySelector('media-controller#r5')
		const actualPlayTime = mediaController?.getAttribute('mediacurrenttime')
		const msPlayed = actualPlayTime ? Math.round(Number.parseFloat(actualPlayTime) * 1000) : 0
		endPlayHistoryEntry(previousTrackId, {ms_played: msPlayed, reason_end: endReason})
	}
	if (startReason && track.slug) {
		addPlayHistoryEntry(track, {reason_start: startReason, shuffle: appState.shuffle})
	}

	appState.playlist_track = id
	if (!appState.playlist_tracks.length || !appState.playlist_tracks.includes(id)) await setPlaylist(ids)

	// Auto-update broadcast if currently broadcasting
	if (appState.broadcasting_channel_id && startReason !== 'broadcast_sync') {
		try {
			await upsertRemoteBroadcast(appState.broadcasting_channel_id, id)
			log.log('broadcast_auto_updated', {
				channelId: appState.broadcasting_channel_id,
				trackId: id,
				startReason
			})
		} catch (error) {
			log.error('broadcast_auto_update_failed', {
				channelId: appState.broadcasting_channel_id,
				trackId: id,
				error: /** @type {Error} */ (error).message
			})
		}
	}

	// Wait for Svelte to update the DOM (render the player element) before calling play
	await tick()
	log.debug('playTrack calling play()')
	play()
}

/**
 * @param {{id: string, slug: string}} channel
 * @param {number} index
 */
export async function playChannel({id, slug}, index = 0) {
	log.log('play_channel', {id, slug})
	leaveBroadcast()
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()]
		.filter((t) => t.slug === slug)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
	if (!tracks.length) {
		log.warn('play_channel_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	await setPlaylist(ids)
	await playTrack(tracks[index].id, null, 'play_channel')
}

/** Play channel starting from random track with shuffle enabled */
export async function shufflePlayChannel({id, slug}) {
	log.log('shuffle_play_channel', {id, slug})
	leaveBroadcast()
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
	if (!tracks.length) {
		log.warn('shuffle_play_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	const randomIndex = Math.floor(Math.random() * ids.length)
	await setPlaylist(ids)
	appState.shuffle = true
	await playTrack(ids[randomIndex], null, 'play_channel')
}

/** @param {string[]} trackIds */
export function setPlaylist(trackIds) {
	appState.playlist_tracks = trackIds
	appState.playlist_tracks_shuffled = shuffleArray(trackIds)
}

/** @param {string[]} trackIds */
export function addToPlaylist(trackIds) {
	const currentTracks = appState.playlist_tracks || []
	appState.playlist_tracks = [...currentTracks, ...trackIds]

	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = shuffleArray(appState.playlist_tracks)
	}
}

/** Queue track(s) to play after the current track */
export function playNext(trackIds) {
	const ids = Array.isArray(trackIds) ? trackIds : [trackIds]
	const currentId = appState.playlist_track
	if (!currentId) {
		appState.playlist_tracks = ids
		return
	}
	appState.playlist_tracks = queueInsertManyAfter(appState.playlist_tracks, currentId, ids)
	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = queueInsertManyAfter(appState.playlist_tracks_shuffled, currentId, ids)
	}
	log.log('play_next', {ids, after: currentId})
}

/** Remove track from queue */
export function removeFromQueue(trackId) {
	appState.playlist_tracks = queueRemove(appState.playlist_tracks, trackId)
	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = queueRemove(appState.playlist_tracks_shuffled, trackId)
	}
	log.log('remove_from_queue', {trackId})
}

export function toggleTheme() {
	const isDark = document.documentElement.classList.contains('dark')
	document.documentElement.classList.toggle('dark', !isDark)
	document.documentElement.classList.toggle('light', isDark)
	appState.theme = isDark ? 'light' : 'dark'
}

export function toggleQueuePanel() {
	appState.queue_panel_visible = !appState.queue_panel_visible
}

export function togglePlayerExpanded() {
	appState.player_expanded = !appState.player_expanded
	appState.show_video_player = !appState.show_video_player
}

export function openSearch() {
	setTimeout(() => {
		const searchInput = document.querySelector('header input[type="search"]')
		if (searchInput instanceof HTMLInputElement) searchInput.focus()
	}, 0)
}

export function togglePlayPause() {
	/** @type {HTMLElement & {paused: boolean, play(): void, pause(): void} | null} */
	const ytPlayer = document.querySelector('youtube-video')
	if (ytPlayer) {
		if (ytPlayer.paused) {
			ytPlayer.play()
		} else {
			ytPlayer.pause()
		}
	}
}

/** Play from this track to end of list (useful for "play from here" action) */
export function playFromHere(trackId) {
	const idx = appState.playlist_tracks.indexOf(trackId)
	if (idx === -1) return
	const fromHere = appState.playlist_tracks.slice(idx)
	appState.playlist_tracks = fromHere
	appState.playlist_tracks_shuffled = shuffleArray(fromHere)
	playTrack(trackId, null, 'user_click_track')
	log.log('play_from_here', {trackId, remaining: fromHere.length})
}

/** Clear the queue but keep current track */
export function clearQueue() {
	const current = appState.playlist_track
	if (current) {
		appState.playlist_tracks = [current]
		appState.playlist_tracks_shuffled = [current]
	} else {
		appState.playlist_tracks = []
		appState.playlist_tracks_shuffled = []
	}
	log.log('clear_queue', {kept: current})
}

/** Toggle shuffle mode on/off. Switches between original order and a pre-shuffled order.
 * The two orderings stay fixed - toggling just switches which one is active. */
export function toggleShuffle() {
	appState.shuffle = !appState.shuffle
	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = shuffleArray(appState.playlist_tracks || [])
	}
}

/** Shuffle remaining tracks in place. Keeps current track, randomizes what comes next.
 * Unlike toggleShuffle, this is destructive - it changes the actual queue order. */
export function shuffleRemaining() {
	const current = appState.playlist_track
	if (!current) return
	appState.playlist_tracks = queueShuffleKeepCurrent(appState.playlist_tracks, current)
	appState.playlist_tracks_shuffled = queueShuffleKeepCurrent(appState.playlist_tracks_shuffled, current)
	log.log('shuffle_remaining', {current})
}

/** Rotate queue: move played tracks to end (radio-like infinite play) */
export function rotateQueue() {
	const current = appState.playlist_track
	if (!current) return
	appState.playlist_tracks = queueRotate(appState.playlist_tracks, current)
	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = queueRotate(appState.playlist_tracks_shuffled, current)
	}
	log.log('rotate_queue', {current})
}

/** @typedef {HTMLElement & {paused: boolean, play(): Promise<void> | void, pause(): void}} MediaPlayer */

/** @param {MediaPlayer | null} [player] */
export function play(player) {
	if (!player) {
		const el = document.querySelector('youtube-video') || document.querySelector('soundcloud-player')
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
				log.log('play() succeeded')
			})
			.catch((error) => {
				log.warn('play() was prevented:', error.message || error)
				throw error
			})
	}
	return Promise.resolve()
}

/** @param {MediaPlayer} player */
export function pause(player) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	player.pause()
}

/** @param {MediaPlayer} player */
export function togglePlay(player) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	if (player.paused) {
		play(player)
	} else {
		pause(player)
	}
}

/** @param {number} seconds */
export function seekTo(seconds) {
	const mediaEl = document.querySelector('youtube-video') || document.querySelector('soundcloud-player')
	if (!mediaEl) {
		log.warn('seekTo: no media element found')
		return
	}
	// @ts-expect-error custom element currentTime setter
	mediaEl.currentTime = seconds
}

/**
 * @param {import('$lib/types').Track | undefined} track
 * @param {string[]} activeQueue
 * @param {import('$lib/types').PlayEndReason} endReason
 */
export function next(track, activeQueue, endReason) {
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
		playTrack(nextId, endReason, startReason)
	} else if (activeQueue.length > 0) {
		log.info('Queue ended: looping to start')
		playTrack(activeQueue[0], endReason, 'auto_next')
	} else {
		log.info('No next track available')
	}
}

/**
 * @param {import('$lib/types').Track | undefined} track
 * @param {string[]} activeQueue
 * @param {import('$lib/types').PlayEndReason} endReason
 */
export function previous(track, activeQueue, endReason) {
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
		playTrack(prevId, endReason, 'user_prev')
	} else {
		log.info('No previous track available')
	}
}

export function toggleVideo() {
	appState.show_video_player = !appState.show_video_player
}

export function eject() {
	appState.playlist_track = undefined
	appState.playlist_tracks = []
	appState.playlist_tracks_shuffled = []
	appState.show_video_player = false
	appState.shuffle = false
	appState.is_playing = false
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
