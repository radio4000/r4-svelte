import {page} from '$app/state'
import {tracksCollection, ensureTracksLoaded} from '#lib/collections/tracks.js'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import {eq} from '@tanstack/db'
import type {Track} from '#lib/types.js'

/**
 * Tracks of the channel named by the `?matching=` URL param — the "compare against
 * @other-channel" feature on the tracks and tags pages. Loads that channel's tracks
 * on demand since it's usually a channel the viewer hasn't visited.
 */
export function getMatchingTracksQuery(currentSlug: () => string | undefined) {
	const matchingSlug = $derived((page.url.searchParams.get('matching') ?? '').trim().toLowerCase())

	const query = useLiveQuery(
		(q) =>
			matchingSlug
				? q
						.from({tracks: tracksCollection})
						.where(({tracks}) => eq(tracks.slug, matchingSlug))
						.orderBy(({tracks}) => tracks.created_at, 'desc')
				: null,
		[() => matchingSlug]
	)

	$effect(() => {
		if (!matchingSlug || matchingSlug === currentSlug()) return
		void ensureTracksLoaded(matchingSlug)
	})

	return {
		get matchingSlug() {
			return matchingSlug
		},
		get tracks() {
			return (query.data ?? []) as Track[]
		}
	}
}
