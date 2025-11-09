import {play} from '$lib/api/player'
import {appState, defaultAppState} from '$lib/app-state.svelte'
import {leaveBroadcast, upsertRemoteBroadcast} from '$lib/broadcast'
import {logger} from '$lib/logger'
import {r4} from '$lib/r4'
import {r5} from '$lib/r5'
import {pg} from '$lib/r5/db'
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
			appState.channels = []
			appState.broadcasting_channel_id = undefined
			return null
		}

		const channels = await r4.channels.readUserChannels()
		const wasSignedOut = !appState.channels?.length

		for (const c of channels) {
			await r5.channels.pull({slug: c.slug})
		}

		appState.channels = channels.map((/** @type {any} */ c) => c.id)

		// Sync followers when user signs in (not on every check)
		if (wasSignedOut && appState.channels.length) {
			syncFollowers(appState.channels[0]).catch((err) => log.error('sync_followers_on_signin_error', err))
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

	const track = (await pg.sql`SELECT * FROM tracks WHERE id = ${id}`).rows[0]
	if (!track) throw new Error(`play_track_error: Missing local track: ${id}`)

	// Set flag for user-initiated playback
	const userInitiatedReasons = ['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search']
	if (userInitiatedReasons.includes(startReason)) {
		globalThis.__userInitiatedPlay = true
	}

	// Get current track before we change it
	const previousTrackId = appState.playlist_track

	const tracks = (await pg.sql`select id from tracks where channel_id = ${track.channel_id} order by created_at desc`)
		.rows
	const ids = tracks.map((t) => t.id)

	appState.playlist_track = id
	if (!appState.playlist_tracks.length || !appState.playlist_tracks.includes(id)) await setPlaylist(ids)
	await addPlayHistory({nextTrackId: id, previousTrackId, endReason, startReason})

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
 * @param {import('$lib/types').Channel} channel
 * @param {number} index
 */
export async function playChannel({id, slug}, index = 0) {
	log.log('play_channel', {id, slug})
	leaveBroadcast()
	if (await r5.channels.outdated(slug)) await r5.pull(slug)
	const tracks = (await pg.sql`select * from tracks where channel_id = ${id} order by created_at desc`).rows
	const ids = tracks.map((t) => t.id)
	await setPlaylist(ids)
	await playTrack(tracks[index].id, '', 'play_channel')
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

export async function resetDatabase() {
	Object.assign(appState, defaultAppState)
	await new Promise((resolve) => setTimeout(resolve, 100))
	await r5.db.reset()
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

/**
 * @param {object} options
 * @param {string} [options.previousTrackId]
 * @param {string} options.nextTrackId
 * @param {string} [options.endReason]
 * @param {string} options.startReason
 */
export async function addPlayHistory({previousTrackId, nextTrackId, endReason = '', startReason}) {
	const {rows} = await pg.sql`SELECT shuffle FROM app_state WHERE id = 1`
	const shuffleState = rows[0]?.shuffle || false

	if (previousTrackId && previousTrackId !== nextTrackId && endReason) {
		const mediaController = document.querySelector('media-controller#r5')
		const actualPlayTime = mediaController?.getAttribute('mediacurrenttime')
		const msPlayed = actualPlayTime ? Math.round(Number.parseFloat(actualPlayTime) * 1000) : 0

		await pg.sql`
			UPDATE play_history
			SET ended_at = CURRENT_TIMESTAMP,
				ms_played = ${msPlayed},
				reason_end = ${endReason}
			WHERE track_id = ${previousTrackId} AND ended_at IS NULL
		`
	}

	// Start new track if reason provided
	if (startReason) {
		await pg.sql`
			INSERT INTO play_history (
				track_id, started_at, ended_at, ms_played,
				reason_start, reason_end, shuffle, skipped
			) VALUES (
				${nextTrackId}, CURRENT_TIMESTAMP, NULL, 0,
				${startReason}, NULL, ${shuffleState}, FALSE
			)
		`
	}
}

/**
 * @param {string} followerId - ID of the user's channel
 * @param {string} channelId - ID of the channel to follow
 */
export async function followChannel(followerId, channelId) {
	await pg.sql`
		INSERT INTO followers (follower_id, channel_id, created_at, synced_at)
		VALUES (${followerId}, ${channelId}, CURRENT_TIMESTAMP, NULL)
		ON CONFLICT (follower_id, channel_id) DO NOTHING
	`

	// If authenticated and not a v1 channel, sync to R4 immediately
	if (appState.channels?.length && followerId !== 'local-user') {
		const channel = await pg.sql`SELECT source FROM channels WHERE id = ${channelId}`.then((r) => r.rows[0])
		if (channel?.source !== 'v1') {
			try {
				await r4.channels.followChannel(followerId, channelId)
				await pg.sql`
					UPDATE followers
					SET synced_at = CURRENT_TIMESTAMP
					WHERE follower_id = ${followerId} AND channel_id = ${channelId}
				`
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
	if (appState.channels?.length && followerId !== 'local-user') {
		const channel = await pg.sql`SELECT source FROM channels WHERE id = ${channelId}`.then((r) => r.rows[0])
		if (channel?.source !== 'v1') {
			try {
				await r4.channels.unfollowChannel(followerId, channelId)
				log.log('unfollow_synced', {followerId, channelId})
			} catch (err) {
				log.error('unfollow_sync_error', {followerId, channelId, err})
			}
		}
	}

	await pg.sql`
		DELETE FROM followers
		WHERE follower_id = ${followerId} AND channel_id = ${channelId}
	`
}

/**
 * Get followers for a user, auto-pulling from remote if needed
 * @param {string} followerId - ID of the user's channel
 * @returns {Promise<import('$lib/types').Channel[]>}
 */
export async function getFollowers(followerId) {
	log.log('getting_followers', followerId)
	const {rows} = await pg.sql`
		SELECT c.*
		FROM followers f
		JOIN channels c ON f.channel_id = c.id
		WHERE f.follower_id = ${followerId}
		ORDER BY f.created_at DESC
	`
	if (rows.length === 0 && followerId !== 'local-user') {
		log.log('pulling_followers', {followerId, reason: 'no_local_followers'})
		await pullFollowers(followerId)
		const {rows: newRows} = await pg.sql`
			SELECT c.*
			FROM followers f
			JOIN channels c ON f.channel_id = c.id
			WHERE f.follower_id = ${followerId}
			ORDER BY f.created_at DESC
		`
		return newRows
	}
	return rows
}

/**
 * @param {string} followerId - ID of the user's channel
 * @param {string} channelId - ID of the channel to check
 * @returns {Promise<boolean>}
 */
export async function isFollowing(followerId, channelId) {
	const {rows} = await pg.sql`
		SELECT 1 FROM followers
		WHERE follower_id = ${followerId} AND channel_id = ${channelId}
		LIMIT 1
	`
	return rows.length > 0
}

/**
 * Updates a local track, then remote
 * @param {string} trackId
 * @param {object} updates
 * @param {string} [updates.title]
 * @param {string} [updates.description]
 * @param {string} [updates.url]
 */
export async function updateTrack(trackId, updates) {
	log.log('update_track', {trackId, updates})

	// Update locally first
	await pg.sql`
		UPDATE tracks
		SET
			title = COALESCE(${updates.title}, title),
			description = COALESCE(${updates.description}, description),
			url = COALESCE(${updates.url}, url)
		WHERE id = ${trackId}
	`

	try {
		await r4.tracks.updateTrack(trackId, updates)
		log.log('track_updated_remotely', {trackId})
	} catch (error) {
		log.error('remote_update_failed', {trackId, error})
	}

	// Dispatch event for UI updates
	document.dispatchEvent(
		new CustomEvent('r5:trackUpdated', {
			detail: {trackId}
		})
	)
}

/**
 * @param {string} trackId
 */
export async function deleteTrack(trackId) {
	log.log('delete_track', {trackId})

	// Verify ownership before deleting
	const track = (await pg.sql`SELECT channel_id FROM tracks WHERE id = ${trackId}`).rows[0]
	if (!track) {
		log.warn('track_not_found', {trackId})
		return
	}

	const isOwner = appState.channels?.includes(track.channel_id)
	if (appState.channels?.length && !isOwner) {
		log.error('delete_unauthorized', {trackId, channelId: track.channel_id})
		throw new Error('Cannot delete track from channel you do not own')
	}

	// Delete locally
	await pg.sql`DELETE FROM tracks WHERE id = ${trackId}`

	try {
		await r4.tracks.deleteTrack(trackId)
		log.log('track_deleted_remotely', {trackId})
	} catch (error) {
		log.error('remote_delete_failed', {trackId, error})
	}

	// Dispatch event for UI updates
	document.dispatchEvent(
		new CustomEvent('r5:trackDeleted', {
			detail: {trackId}
		})
	)
}
