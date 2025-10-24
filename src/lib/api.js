import {play} from '$lib/api/player'
import {defaultAppState} from '$lib/app-state.svelte'
import {leaveBroadcast, upsertRemoteBroadcast} from '$lib/broadcast'
import {
	getTracksCollection,
	getChannelsCollection,
	isChannelOutdated,
	fetchChannelTracks,
	playHistoryCollection,
	followersCollection,
	appStateCollection
} from '$lib/collections'
import {logger} from '$lib/logger'
import {r4} from '$lib/r4'
import {r5} from '$lib/r5'
import {pull as pullFollowers, sync as syncFollowers} from '$lib/r5/followers'
import {shuffleArray} from '$lib/utils.ts'

const log = logger.ns('api').seal()

/**
 * @typedef {object} User
 * @prop {string} id
 * @prop {string} email
 */

export async function checkUser() {
	try {
		const user = await r4.users.readUser()
		if (!user) {
			appStateCollection.update(1, (draft) => {
				draft.channels = []
				draft.broadcasting_channel_id = undefined
			})
			return null
		}

		const channels = await r4.channels.readUserChannels()
		const appState = appStateCollection.get(1)
		const wasSignedOut = !appState?.channels?.length

		for (const c of channels) {
			await r5.channels.pull({slug: c.slug})
		}

		const channelIds = channels.map((/** @type {any} */ c) => c.id)
		appStateCollection.update(1, (draft) => {
			draft.channels = channelIds
		})

		// Sync followers when user signs in (not on every check)
		if (wasSignedOut && channelIds.length) {
			syncFollowers(channelIds[0]).catch((err) => log.error('sync_followers_on_signin_error', err))
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

	// Get track from collection
	const tracksCollection = getTracksCollection()
	const track = tracksCollection.toArray.find((t) => t.id === id)
	if (!track) throw new Error(`play_track_error: Missing local track: ${id}`)

	// Set flag for user-initiated playback
	const userInitiatedReasons = ['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search']
	if (userInitiatedReasons.includes(startReason)) {
		globalThis.__userInitiatedPlay = true
	}

	// Get current track before we change it
	const appState = appStateCollection.get(1)
	const previousTrackId = appState?.playlist_track

	// Get all track IDs for this channel
	const tracks = tracksCollection.toArray
		.filter((t) => t.channel_id === track.channel_id)
		.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
	const ids = tracks.map((t) => t.id)

	appStateCollection.update(1, (draft) => {
		draft.playlist_track = id
	})
	if (!appState?.playlist_tracks.length || !appState?.playlist_tracks.includes(id)) await setPlaylist(ids)
	await addPlayHistory({nextTrackId: id, previousTrackId, endReason, startReason})

	// Auto-update broadcast if currently broadcasting
	const currentState = appStateCollection.get(1)
	if (currentState?.broadcasting_channel_id && startReason !== 'broadcast_sync') {
		try {
			await upsertRemoteBroadcast(currentState.broadcasting_channel_id, id)
			log.log('broadcast_auto_updated', {
				channelId: currentState.broadcasting_channel_id,
				trackId: id,
				startReason
			})
		} catch (error) {
			log.error('broadcast_auto_update_failed', {
				channelId: currentState.broadcasting_channel_id,
				trackId: id,
				error: /** @type {Error} */ (error).message
			})
		}
	}

	log.debug('playTrack calling play()')
	play()
}

/**
 * @param {import('$lib/types').Channel} channel
 * @param {number} index
 */
export async function playChannel({id, slug}, index = 0) {
	log.log('play_channel', {id, slug})
	leaveBroadcast()

	// Check if tracks need updating using smart staleness check
	if (await isChannelOutdated(slug)) {
		await fetchChannelTracks(slug)
	}

	// Get tracks from collection
	const tracksCollection = getTracksCollection()
	const tracks = tracksCollection.toArray
		.filter((t) => t.channel_id === id)
		.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

	const ids = tracks.map((t) => t.id)
	await setPlaylist(ids)
	await playTrack(tracks[index].id, '', 'play_channel')
}

/** @param {string[]} trackIds */
export async function setPlaylist(trackIds) {
	appStateCollection.update(1, (draft) => {
		draft.playlist_tracks = trackIds
		draft.playlist_tracks_shuffled = shuffleArray(trackIds)
	})
}

/** @param {string[]} trackIds */
export async function addToPlaylist(trackIds) {
	const appState = appStateCollection.get(1)
	const currentTracks = appState?.playlist_tracks || []
	const newTracks = [...currentTracks, ...trackIds]

	appStateCollection.update(1, (draft) => {
		draft.playlist_tracks = newTracks
		// If shuffle is on, regenerate the shuffled playlist
		if (draft.shuffle) {
			draft.playlist_tracks_shuffled = shuffleArray(newTracks)
		}
	})
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
	appStateCollection.update(1, (draft) => {
		draft.theme = newTheme
	})
}

export async function toggleQueuePanel() {
	appStateCollection.update(1, (draft) => {
		draft.queue_panel_visible = !draft.queue_panel_visible
	})
}

export async function resetDatabase() {
	appStateCollection.update(1, () => ({...defaultAppState}))
	await new Promise((resolve) => setTimeout(resolve, 100))
	await r5.db.reset()
}

export function togglePlayerExpanded() {
	appStateCollection.update(1, (draft) => {
		draft.player_expanded = !draft.player_expanded
		draft.show_video_player = !draft.show_video_player
	})
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

/**
 * @param {object} options
 * @param {string} [options.previousTrackId]
 * @param {string} options.nextTrackId
 * @param {string} [options.endReason]
 * @param {string} options.startReason
 */
export async function addPlayHistory({previousTrackId, nextTrackId, endReason = '', startReason}) {
	const appState = appStateCollection.get(1)
	const shuffleState = appState?.shuffle

	if (previousTrackId && previousTrackId !== nextTrackId && endReason) {
		const mediaController = document.querySelector('media-controller#r5')
		const actualPlayTime = mediaController?.getAttribute('mediacurrenttime')
		const msPlayed = actualPlayTime ? Math.round(Number.parseFloat(actualPlayTime) * 1000) : 0

		// Find and update the most recent unclosed entry for this track
		const entries = playHistoryCollection.toArray
			.filter((e) => e.track_id === previousTrackId && !e.ended_at)
			.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

		if (entries[0]) {
			playHistoryCollection.update(entries[0].id, (draft) => {
				draft.ended_at = new Date().toISOString()
				draft.ms_played = msPlayed
				draft.reason_end = endReason
			})
		}
	}

	// Start new track if reason provided
	if (startReason) {
		playHistoryCollection.insert({
			id: crypto.randomUUID(),
			track_id: nextTrackId,
			started_at: new Date().toISOString(),
			ended_at: null,
			ms_played: 0,
			reason_start: startReason,
			reason_end: null,
			shuffle: shuffleState,
			skipped: false
		})
	}
}

/**
 * @param {string} followerId - ID of the user's channel
 * @param {string} channelId - ID of the channel to follow
 */
export async function followChannel(followerId, channelId) {
	const key = `${followerId}:${channelId}`
	const existing = followersCollection.toArray.find((f) => f.follower_id === followerId && f.channel_id === channelId)

	if (!existing) {
		followersCollection.insert({
			follower_id: followerId,
			channel_id: channelId,
			created_at: new Date().toISOString(),
			synced_at: null
		})
	}

	// If authenticated and not a v1 channel, sync to R4 immediately
	const appState = appStateCollection.get(1)
	if (appState?.channels?.length && followerId !== 'local-user') {
		const channelsCollection = getChannelsCollection()
		const channel = channelsCollection.toArray.find((c) => c.id === channelId)
		if (channel?.source !== 'v1') {
			try {
				await r4.channels.followChannel(followerId, channelId)
				followersCollection.update(key, (draft) => {
					draft.synced_at = new Date().toISOString()
				})
				log.log('follow_synced', {followerId, channelId})
			} catch (err) {
				log.error('follow_sync_error', {followerId, channelId, err})
			}
		}
	}
}

/**
 * @param {string} followerId - ID of the user's channel
 * @param {string} channelId - ID of the channel to unfollow
 */
export async function unfollowChannel(followerId, channelId) {
	// If authenticated and not a v1 channel, unfollow from R4 first
	const appState = appStateCollection.get(1)
	if (appState?.channels?.length && followerId !== 'local-user') {
		const channelsCollection = getChannelsCollection()
		const channel = channelsCollection.toArray.find((c) => c.id === channelId)
		if (channel?.source !== 'v1') {
			try {
				await r4.channels.unfollowChannel(followerId, channelId)
				log.log('unfollow_synced', {followerId, channelId})
			} catch (err) {
				log.error('unfollow_sync_error', {followerId, channelId, err})
			}
		}
	}

	const key = `${followerId}:${channelId}`
	followersCollection.delete(key)
}

/**
 * Get followers for a user, auto-pulling from remote if needed
 * @param {string} followerId - ID of the user's channel
 * @returns {Promise<import('$lib/types').Channel[]>}
 */
export async function getFollowers(followerId) {
	log.log('getting_followers', followerId)
	const channelsCollection = getChannelsCollection()

	// Get channel IDs from followers collection
	const followerRecords = followersCollection.toArray
		.filter((f) => f.follower_id === followerId)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

	// Join with channels
	const channels = followerRecords
		.map((f) => channelsCollection.toArray.find((c) => c.id === f.channel_id))
		.filter((c) => c !== undefined)

	if (channels.length === 0 && followerId !== 'local-user') {
		log.log('pulling_followers', {followerId, reason: 'no_local_followers'})
		await pullFollowers(followerId)

		// Re-fetch after pull
		const newFollowerRecords = followersCollection.toArray
			.filter((f) => f.follower_id === followerId)
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

		return newFollowerRecords
			.map((f) => channelsCollection.toArray.find((c) => c.id === f.channel_id))
			.filter((c) => c !== undefined)
	}

	return channels
}

/**
 * @param {string} followerId - ID of the user's channel
 * @param {string} channelId - ID of the channel to check
 * @returns {Promise<boolean>}
 */
export async function isFollowing(followerId, channelId) {
	return followersCollection.toArray.some((f) => f.follower_id === followerId && f.channel_id === channelId)
}

/**
 * @param {string} trackId
 */
export async function deleteTrack(trackId) {
	log.log('delete_track', {trackId})

	// Delete locally
	const tracksCollection = getTracksCollection()
	tracksCollection.delete(trackId)

	// Delete remotely if authenticated
	const appState = appStateCollection.get(1)
	if (appState?.channels?.length) {
		try {
			await r4.tracks.deleteTrack(trackId)
			log.log('track_deleted_remotely', {trackId})
		} catch (error) {
			log.error('remote_delete_failed', {trackId, error})
		}
	}

	// Dispatch event for UI updates
	document.dispatchEvent(
		new CustomEvent('r5:trackDeleted', {
			detail: {trackId}
		})
	)
}
