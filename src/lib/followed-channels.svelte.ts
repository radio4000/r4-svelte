import {channelsCollection, loadMoreChannels} from '$lib/collections/channels'
import {followsCollection} from '$lib/collections/follows'
import {useLiveQuery} from '$lib/useLiveQuery.svelte'
import type {Channel} from '$lib/types'

/**
 * Reactive followed-channels state. Call inside a component script block.
 * Fetches followed channel IDs via live query, then loads full channel objects.
 */
export function getFollowedChannels() {
	const followsQuery = useLiveQuery((q) => q.from({f: followsCollection}))
	const followedIds = $derived((followsQuery.data ?? []).map((f) => (f as {id: string}).id))

	let fetched = $state(false)
	$effect(() => {
		if (!followedIds.length || fetched) return
		fetched = true
		void (async () => {
			try {
				await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
				loadMoreChannels({idIn: followedIds.slice(), offset: 0, limit: followedIds.length})
			} catch (e) {
				console.warn('[followed-channels] failed to load channels', e)
			}
		})()
	})

	const followedChannels = $derived.by(() => {
		if (!followedIds.length) return [] as Channel[]
		// Access .size so this derived re-runs when channels are upserted into the collection
		void channelsCollection.state.size
		return (
			[...channelsCollection.state.values()]
				.filter((ch) => ch && followedIds.includes(ch.id))
				// ISO strings are lexicographically comparable — no Date parsing needed
				.toSorted((a, b) => (b.latest_track_at ?? '').localeCompare(a.latest_track_at ?? '')) as Channel[]
		)
	})

	return {
		get isLoading() {
			return followsQuery.isLoading
		},
		get followedIds() {
			return followedIds
		},
		get followedChannels() {
			return followedChannels
		}
	}
}
