import {play} from '$lib/api/player'
import {appState} from '$lib/app-state.svelte'
import {leaveBroadcast, upsertRemoteBroadcast} from '$lib/broadcast'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {shuffleArray} from '$lib/utils.ts'
import {tracksCollection, addPlayHistoryEntry, endPlayHistoryEntry, pullFollows} from '../routes/tanstack/collections'

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
		const wasSignedOut = !appState.channels?.length

		// Store IDs - collection handles fetching when needed
		appState.channels = channels.map((c) => c.id)
		appState.channel = channels[0] || undefined

		// Pull follows when user signs in (not on every check)
		if (wasSignedOut && appState.channels.length) {
			pullFollows(appState.channels[0]).catch((err) => log.error('pull_follows_on_signin_error', err))
		}

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

/** @param {string[]} trackIds */
export async function setPlaylist(trackIds) {
	appState.playlist_tracks = trackIds
	appState.playlist_tracks_shuffled = shuffleArray(trackIds)
}

/** @param {string[]} trackIds */
export async function addToPlaylist(trackIds) {
	const currentTracks = appState.playlist_tracks || []
	appState.playlist_tracks = [...currentTracks, ...trackIds]

	// If shuffle is on, regenerate the shuffled playlist
	if (appState.shuffle) {
		appState.playlist_tracks_shuffled = shuffleArray(appState.playlist_tracks)
	}
}

export async function toggleTheme() {
	const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
	const newTheme = currentTheme === 'light' ? 'dark' : 'light'
	if (newTheme === 'dark') {
		document.documentElement.classList.remove('light')
		document.documentElement.classList.add('dark')
	} else {
		document.documentElement.classList.remove('dark')
		document.documentElement.classList.add('light')
	}
	appState.theme = newTheme
}

export async function toggleQueuePanel() {
	appState.queue_panel_visible = !appState.queue_panel_visible
}

export function togglePlayerExpanded() {
	appState.player_expanded = !appState.player_expanded
	appState.show_video_player = !appState.show_video_player
}

export function openSearch() {
	//goto('/search').then(() => {
	// Focus the search input after navigation
	setTimeout(() => {
		const searchInput = document.querySelector('header input[type="search"]')
		if (searchInput instanceof HTMLInputElement) searchInput.focus()
	}, 0)
	//})
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
