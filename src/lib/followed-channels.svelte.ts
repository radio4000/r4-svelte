import {channelsCollection} from '$lib/collections/channels'
import {followsCollection} from '$lib/collections/follows'
import {useLiveQuery} from '$lib/useLiveQuery.svelte'
import {inArray} from '@tanstack/db'
import type {Channel} from '$lib/types'

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
