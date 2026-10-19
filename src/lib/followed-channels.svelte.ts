import {sdk} from '@radio4000/sdk'
import {channelsCollection} from '#lib/collections/channels.js'
import {followsCollection} from '#lib/collections/follows.js'
import {queryClient} from '#lib/collections/query-client.js'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import {dedupeById} from '#lib/utils.js'
import {inArray} from '@tanstack/db'
import type {Channel} from '#lib/types.js'

const CONNECTION_STALE_TIME = 5 * 60 * 1000

/**
 * Reactive followed-channels state. Call inside a component script block.
 * Fetches followed channel IDs via live query, then loads full channel objects
 * through the collection's queryFn (idIn path).
 */
export function getFollowedChannels() {
	const followsQuery = useLiveQuery((q) => q.from({f: followsCollection}))
	const followedIds = $derived((followsQuery.data ?? []).map((f) => (f as {id: string}).id))

	const followedQuery = useLiveQuery((q) => {
		if (!followedIds.length) return null
		return q
			.from({ch: channelsCollection})
			.where(({ch}) => inArray(ch.id, followedIds))
			.orderBy(({ch}) => ch.latest_track_at, 'desc')
	})

	return {
		get isLoading() {
			return followsQuery.isLoading
		},
		get followedIds() {
			return followedIds
		},
		get followedChannels() {
			return (followedQuery.data ?? []) as Channel[]
		}
	}
}

/** Cached fetch of follower channel ids for any channel. */
export function fetchFollowerIds(channelId: string): Promise<string[]> {
	return queryClient.fetchQuery({
		queryKey: ['channel-follower-ids', channelId],
		queryFn: async () => {
			const {data, error} = await sdk.channels.readFollowers(channelId)
			if (error) throw error
			return dedupeById(data ?? [])
				.map((c) => c.id)
				.filter((id): id is string => Boolean(id))
		},
		staleTime: CONNECTION_STALE_TIME
	})
}

/** Cached fetch of channel ids a channel follows. */
export function fetchFollowingIds(channelId: string): Promise<string[]> {
	return queryClient.fetchQuery({
		queryKey: ['channel-following-ids', channelId],
		queryFn: async () => {
			const {data, error} = await sdk.channels.readFollowings(channelId)
			if (error) throw error
			return dedupeById(data ?? [])
				.map((c) => c.id)
				.filter((id): id is string => Boolean(id))
		},
		staleTime: CONNECTION_STALE_TIME
	})
}

/**
 * Reactive followers or following of any channel. Call inside a component script block.
 * Fetches ids (cached), then hydrates full channel objects through the channels
 * collection's idIn path, which only fetches rows not already in memory.
 * Pass `hydrate: false` when only the ids are needed (e.g. intersections with
 * the user's own follows) — skips the channel fetch entirely.
 */
export function getChannelConnections(
	kind: 'followers' | 'following',
	getChannelId: () => string | undefined | null,
	{hydrate = true}: {hydrate?: boolean} = {}
) {
	const fetchIds = kind === 'followers' ? fetchFollowerIds : fetchFollowingIds
	let ids = $state<string[]>([])
	let idsLoading = $state(true)

	$effect(() => {
		const channelId = getChannelId()
		if (!channelId) {
			ids = []
			idsLoading = false
			return
		}
		idsLoading = true
		let stale = false
		fetchIds(channelId)
			.then((result) => {
				if (stale) return
				ids = result
				idsLoading = false
			})
			.catch(() => {
				if (stale) return
				ids = []
				idsLoading = false
			})
		return () => {
			stale = true
		}
	})

	const channelsQuery = useLiveQuery((q) =>
		hydrate && ids.length
			? q.from({ch: channelsCollection}).where(({ch}) => inArray(ch.id, ids))
			: null
	)

	return {
		get loading() {
			return idsLoading || channelsQuery.isLoading
		},
		get ids() {
			return ids
		},
		get channels() {
			return (channelsQuery.data ?? []) as Channel[]
		}
	}
}
