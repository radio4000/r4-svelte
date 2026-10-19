import {getFeaturedPool} from '#lib/collections/featured.js'
import {fetchTopTags} from '#lib/collections/tags.js'
import type {Channel} from '#lib/types.js'

/**
 * Reactive featured suggestions for search/explore empty states.
 * Channel pool via getFeaturedPool() and the most-used tags via fetchTopTags(), both
 * cached one hour and shared across pages. Call inside a component script block.
 */
export function getFeaturedSuggestions() {
	let pool = $state.raw<Channel[]>([])
	let tags = $state.raw<string[]>([])

	$effect(() => {
		let stale = false
		getFeaturedPool().then((channels) => {
			if (!stale) pool = channels
		})
		fetchTopTags()
			.then((top) => {
				if (!stale) tags = top
			})
			.catch((e) => console.warn('[featured] failed to load tags', e))
		return () => {
			stale = true
		}
	})

	return {
		get pool() {
			return pool
		},
		get tags() {
			return tags
		}
	}
}
