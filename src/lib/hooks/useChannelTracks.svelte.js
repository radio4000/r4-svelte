/**
 * Hook that bridges useLiveQuery → loadSubset → collection
 *
 * Automatically loads tracks for a channel on-demand, with instant
 * revisits and smart caching.
 *
 * @example
 * const { tracks, isLoading, error } = useChannelTracks('ko002', { limit: 20 })
 */

import { useLiveQuery } from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte.js'
import { eq } from '@tanstack/db'

export function useChannelTracks(slug, options = {}) {
	const { limit = 20, orderBy = 'desc' } = options

	// Track loading state separate from live query
	let isLoadingSubset = $state(false)
	let loadError = $state(null)

	// Get collection reference (will be passed as parameter)
	const tracksCollection = options.collection
	if (!tracksCollection) {
		throw new Error('useChannelTracks requires collection option')
	}

	// Trigger loadSubset before querying
	$effect(() => {
		if (!slug) return

		// Match TanStack predicate structure for extractSlugFromPredicate
		const where = {
			type: 'eq',
			left: { path: ['channel_slug'] },
			right: { value: slug }
		}

		// Check if already loaded
		const alreadyLoaded = tracksCollection.isSubsetLoaded?.({ where, limit })

		if (!alreadyLoaded && tracksCollection.loadSubset) {
			isLoadingSubset = true
			loadError = null

			tracksCollection
				.loadSubset({ where, limit })
				.then(() => {
					isLoadingSubset = false
				})
				.catch((err) => {
					isLoadingSubset = false
					loadError = err
				})
		}
	})

	// Query collection (reactive, updates when data arrives)
	const liveQuery = useLiveQuery(
		(q) =>
			q
				.from({ t: tracksCollection })
				.where(({ t }) => eq(t.channel_slug, slug))
				.orderBy(({ t }) => t.created_at, orderBy)
				.limit(limit),
		[slug]
	)

	return {
		get tracks() {
			return liveQuery.data || []
		},
		get isLoading() {
			return isLoadingSubset || liveQuery.isLoading
		},
		get error() {
			return loadError || liveQuery.error
		},
		get status() {
			return liveQuery.status
		}
	}
}
