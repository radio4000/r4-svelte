import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {appState} from '#lib/app-state.svelte.js'
import {queryClient} from './query-client'
import {logger} from '#lib/logger.js'

const log = logger.ns('follows').seal()

// Channel IDs the current user follows
export const followsCollection = createCollection<{id: string}, string>(
	queryCollectionOptions({
		queryKey: () => {
			const userChannelId = appState.channels?.[0]
			return userChannelId ? ['follows', userChannelId] : ['follows']
		},
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async () => {
			const userChannelId = appState.channels?.[0]
			if (!userChannelId) return []
			return fetchUserFollows(userChannelId)
		}
	})
)

async function fetchUserFollows(userChannelId: string) {
	const {data, error} = await sdk.channels.readFollowings(userChannelId)
	if (error) throw error
	return (data || []).map((ch) => ({id: ch.id}))
}

/** Replace collection rows with fetched follows (eager sync pins the pre-auth query key). */
function syncFollowsCollection(items: Array<{id: string}>) {
	const nextIds = new Set(items.map((item) => item.id))
	followsCollection.utils.writeBatch(() => {
		for (const item of followsCollection.values()) {
			if (!nextIds.has(item.id)) followsCollection.utils.writeDelete(item.id)
		}
		for (const item of items) {
			if (!followsCollection.has(item.id)) followsCollection.utils.writeInsert(item)
		}
	})
}

/** Fetch the current user's follows and reconcile them into followsCollection. */
export async function loadUserFollows() {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return

	const key = ['follows', userChannelId] as const
	try {
		const items = await queryClient.fetchQuery({
			queryKey: key,
			queryFn: () => fetchUserFollows(userChannelId),
			staleTime: 24 * 60 * 60 * 1000
		})
		syncFollowsCollection(items)
		queryClient.removeQueries({queryKey: ['follows'], exact: true})
	} catch (error) {
		log.warn('load_user_follows_failed', {userChannelId, error})
	}
}

/** Optimistically follow a channel; rolls back on failure (unique_violation is treated as success). */
export async function followChannel(channelId: string) {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return

	log.info('follow', {channelId})
	followsCollection.utils.writeInsert({id: channelId})
	const {error} = await sdk.channels.followChannel(userChannelId, channelId)
	if (error) {
		// 23505 = unique_violation — already following, keep optimistic insert
		if (error.code === '23505') {
			log.info('already following', {channelId})
		} else {
			log.warn('follow failed', {channelId, error})
			followsCollection.utils.writeDelete(channelId)
		}
	}
}

/** Optimistically unfollow a channel; rolls back on failure. */
export async function unfollowChannel(channelId: string) {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return

	log.info('unfollow', {channelId})
	followsCollection.utils.writeDelete(channelId)
	const {error} = await sdk.channels.unfollowChannel(userChannelId, channelId)
	if (error) {
		log.warn('unfollow failed', {channelId, error})
		followsCollection.utils.writeInsert({id: channelId})
	}
}
