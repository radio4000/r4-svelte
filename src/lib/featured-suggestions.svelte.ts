import {getFeaturedPool} from '#lib/collections/featured.js'
import {tagsCollection} from '#lib/collections/tags.js'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import type {Channel} from '#lib/types.js'

/**
 * Reactive featured suggestions for search/explore empty states.
 * Channel pool via getFeaturedPool() (cached one hour, shared across pages),
 * tags from the global tags table. Call inside a component script block.
 */
export function getFeaturedSuggestions() {
	let pool = $state<Channel[]>([])

	$effect(() => {
		let stale = false
		getFeaturedPool().then((channels) => {
			if (!stale) pool = channels
		})
		return () => {
			stale = true
		}
	})

	const tagsQuery = useLiveQuery((q) =>
		q
			.from({t: tagsCollection})
			.orderBy(({t}) => t.count, 'desc')
			.limit(32)
	)

	return {
		get pool() {
			return pool
		},
		get tags() {
			return (tagsQuery.data ?? []).map((t) => t.tag)
		}
	}
}
