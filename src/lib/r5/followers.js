import {logger} from '$lib/logger'
import {r4} from '$lib/r4'
import {followersCollection, channelsCollection} from '$lib/collections'

const log = logger.ns('r5:followers').seal()

/**
 * Pull remote follows and save to local
 * @param {string} userChannelId User's channel ID
 * @returns {Promise<void>}
 */
export async function pull(userChannelId) {
	const remoteFollows = await r4.channels.readFollowings(userChannelId)

	for (const followedChannel of remoteFollows || []) {
		// Upsert follower relationship, mark as synced
		const key = `${userChannelId}:${followedChannel.id}`
		const existing = followersCollection.toArray.find(
			(f) => f.follower_id === userChannelId && f.channel_id === followedChannel.id
		)

		if (existing) {
			followersCollection.update(key, (draft) => {
				draft.created_at = followedChannel.created_at
				draft.synced_at = new Date().toISOString()
			})
		} else {
			followersCollection.insert({
				follower_id: userChannelId,
				channel_id: followedChannel.id,
				created_at: followedChannel.created_at,
				synced_at: new Date().toISOString()
			})
		}

		// Upsert channel metadata in channels collection
		const channelExists = channelsCollection.toArray.find((c) => c.id === followedChannel.id)
		if (channelExists) {
			channelsCollection.update(followedChannel.id, (draft) => {
				draft.name = followedChannel.name
				draft.slug = followedChannel.slug
				draft.description = followedChannel.description
				draft.image = followedChannel.image
				draft.updated_at = followedChannel.updated_at
				draft.latitude = followedChannel.latitude
				draft.longitude = followedChannel.longitude
				draft.url = followedChannel.url
			})
		} else {
			channelsCollection.insert({
				...followedChannel,
				tracks_outdated: null,
				track_count: null,
				firebase_id: null,
				source: 'r4',
				broadcasting: null,
				broadcast_track_id: null,
				broadcast_started_at: null,
				tracks_synced_at: null,
				spam: null
			})
		}
	}

	log.log('pull_followers', {userChannelId, count: remoteFollows?.length || 0})
}

/**
 * Sync local and remote followers bidirectionally
 * @param {string} userChannelId User's channel ID
 * @returns {Promise<void>}
 */
export async function sync(userChannelId) {
	log.log('sync_start', userChannelId)

	// 1. Get local favorites before sync with channel metadata
	const localFavorites = followersCollection.toArray
		.filter((f) => f.follower_id === 'local-user')
		.map((f) => {
			const channel = channelsCollection.toArray.find((c) => c.id === f.channel_id)
			return {
				channel_id: f.channel_id,
				source: channel?.source || 'unknown'
			}
		})

	// 2. Pull remote followers (marks remote ones as synced)
	await pull(userChannelId)

	// 3. Process each local favorite
	for (const {channel_id, source} of localFavorites) {
		// Check if this channel is already followed by the authenticated user
		const existing = followersCollection.toArray.find(
			(f) => f.follower_id === userChannelId && f.channel_id === channel_id
		)

		if (!existing) {
			const key = `${userChannelId}:${channel_id}`
			if (source === 'v1') {
				// v1 channel: migrate locally only (can't sync to r4)
				followersCollection.insert({
					follower_id: userChannelId,
					channel_id: channel_id,
					created_at: new Date().toISOString(),
					synced_at: null
				})
			} else {
				// r4 channel: add locally and attempt to sync
				followersCollection.insert({
					follower_id: userChannelId,
					channel_id: channel_id,
					created_at: new Date().toISOString(),
					synced_at: null
				})

				// Try to push to remote
				try {
					await r4.channels.followChannel(userChannelId, channel_id)
					followersCollection.update(key, (draft) => {
						draft.synced_at = new Date().toISOString()
					})
				} catch (err) {
					log.error('sync_push_error', {userChannelId, channel_id, err})
				}
			}
		}
	}

	// 4. Clean up local-user followers
	const localUserFollowers = followersCollection.toArray.filter((f) => f.follower_id === 'local-user')
	for (const follower of localUserFollowers) {
		const key = `${follower.follower_id}:${follower.channel_id}`
		followersCollection.delete(key)
	}

	const v1Count = localFavorites.filter((f) => f.source === 'v1').length
	const r4Count = localFavorites.filter((f) => f.source !== 'v1').length

	log.log('sync_complete', {
		userChannelId,
		localCount: localFavorites.length,
		v1Count,
		r4Count
	})
}
