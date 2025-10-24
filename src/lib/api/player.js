import {playTrack} from '$lib/api'
import {appStateCollection} from '$lib/collections'
import {logger} from '$lib/logger'
import {shuffleArray} from '$lib/utils.ts'

/** @typedef {import('$lib/types').AppState} AppState */
/** @typedef {import('$lib/types').Track} Track */
/** @typedef {import('$lib/types').Channel} Channel */
/** @typedef {HTMLElement & {paused: boolean, play(): void, pause(): void} | null} MediaPlayer */

const log = logger.ns('api/player').seal()

/** @param {MediaPlayer} [player] */
export function play(player) {
	// If no player provided, try to find one
	if (!player) {
		player = document.querySelector('youtube-video') || document.querySelector('soundcloud-player')
	}

	if (!player) {
		log.warn('Media player not ready')
		return Promise.reject(new Error('Media player not ready'))
	}

	log.debug('play() check', player, 'paused?', player.paused)

	const promise = player.play()
	if (promise !== undefined) {
		return promise
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

/**
 * @param {Track | undefined} track
 * @param {string[]} activeQueue - we need to know whether we're playing the playlist_tracks or playlist_tracks_shuffled
 * @param {string} endReason - why the current track is ending
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
	const idx = activeQueue.indexOf(track.id)
	const next = activeQueue[idx + 1]
	if (next) {
		// Keep the endReason as-is, but use descriptive startReason
		const startReason =
			endReason === 'track_completed' ? 'auto_next' : endReason.startsWith('youtube_error') ? 'track_error' : endReason
		playTrack(next, endReason, startReason)
	} else {
		log.info('No next track available')
	}
}

/**
 * @param {Track | undefined} track
 * @param {string[]} activeQueue
 * @param {string} endReason - why the current track is ending
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

	const idx = activeQueue.indexOf(track.id)
	const prev = activeQueue[idx - 1]
	if (prev) {
		playTrack(prev, endReason, 'user_prev')
	} else {
		log.info('No previous track available')
	}
}

export function toggleShuffle() {
	const appState = appStateCollection.get(1)
	const newShuffleState = !appState?.shuffle
	if (newShuffleState) {
		// Generate fresh shuffle from current playlist
		appStateCollection.update(1, (draft) => {
			draft.playlist_tracks_shuffled = shuffleArray(draft.playlist_tracks || [])
			draft.shuffle = true
		})
	} else {
		// Just toggle off, keep shuffled array for next time
		appStateCollection.update(1, (draft) => {
			draft.shuffle = false
		})
	}
}

export function toggleVideo() {
	appStateCollection.update(1, (draft) => {
		draft.show_video_player = !draft.show_video_player
	})
}

export function eject() {
	appStateCollection.update(1, (draft) => {
		draft.playlist_track = null
		draft.playlist_tracks = []
		draft.playlist_tracks_shuffled = []
		draft.show_video_player = false
		draft.shuffle = false
		draft.is_playing = false
	})
}
