/**
 * Pre-RFC implementation of loadSubset pattern for TanStack DB
 *
 * Creates a collection that loads data on-demand based on query predicates.
 * Inspired by RFC #676 but works with current TanStack DB.
 *
 * @example
 * const tracksCollection = createLoadSubsetCollection({
 *   id: 'tracks',
 *   getKey: (t) => t.id,
 *   fetchSubset: async ({ slug, limit }) => {
 *     return await r5.tracks.r4({ slug, limit })
 *   },
 *   extractParams: (where) => {
 *     // Parse where clause to extract slug
 *     return { slug: 'ko002' }
 *   }
 * })
 */

import { createCollection, localStorageCollectionOptions } from '@tanstack/svelte-db'

/**
 * Track what's been loaded for each slug
 * Format: Map<slug, { fetchedCount: number, totalCount: number | null, lastFetch: timestamp }>
 */
const loadedState = new Map()

/**
 * Parse TanStack DB where clause to extract channel slug
 * Handles: eq(t.channel_slug, 'ko002')
 */
export function extractSlugFromPredicate(where) {
	if (!where) return null

	// Navigate through the predicate structure
	// TanStack predicates are nested objects with type info
	try {
		// Handle eq(t.channel_slug, value)
		if (where.type === 'eq' || where.operator === 'eq') {
			const left = where.left || where.operands?.[0]
			const right = where.right || where.operands?.[1]

			// Check if left side is channel_slug reference
			if (left?.path?.includes?.('channel_slug') || left?.name === 'channel_slug') {
				return right?.value || right
			}
		}

		// Handle and/or with nested eq
		if (where.type === 'and' || where.type === 'or') {
			const operands = where.operands || []
			for (const operand of operands) {
				const result = extractSlugFromPredicate(operand)
				if (result) return result
			}
		}
	} catch (err) {
		console.warn('Failed to parse predicate for slug:', err)
	}

	return null
}

/**
 * Create a collection with loadSubset-style behavior
 */
export function createLoadSubsetCollection(config) {
	const {
		id,
		getKey,
		fetchSubset, // async ({ slug, limit }) => data[]
		extractParams = extractSlugFromPredicate, // Custom parser
		ttl = 5 * 60 * 1000, // 5 minutes default staleness
		schema // Optional Zod/Valibot schema
	} = config

	// Use localStorage collection for persistence
	const collection = createCollection(
		localStorageCollectionOptions({
			id,
			storageKey: `r5-${id}`,
			getKey,
			initialData: [],
			...(schema && { schema })
		})
	)

	/**
	 * Load subset based on predicates (manual, not auto-called yet)
	 * Returns true if already loaded, Promise if fetching
	 */
	collection.loadSubset = async ({ where, limit = 20 }) => {
		const slug = extractParams(where)

		if (!slug) {
			console.warn('Could not extract slug from predicate:', where)
			return true // Skip loading, return what we have
		}

		const existing = loadedState.get(slug)
		const now = Date.now()

		// Check if already loaded and fresh
		if (existing) {
			const isStale = now - existing.lastFetch > ttl
			const hasEnough = existing.fetchedCount >= limit

			if (hasEnough && !isStale) {
				return true // Instant, no loading
			}
		}

		// Fetch from backend
		try {
			const data = await fetchSubset({ slug, limit })
			console.log(`[loadSubset] Fetched ${data.length} items for ${slug}`)

			// Insert/update items into collection
			let insertCount = 0
			let updateCount = 0
			data.forEach((item) => {
				const key = getKey(item)
				const existing = collection.get(key)
				if (existing) {
					collection.update(key, () => item)
					updateCount++
				} else {
					collection.insert(item)
					insertCount++
				}
			})
			console.log(`[loadSubset] Inserted: ${insertCount}, Updated: ${updateCount}`)

			// Update loaded state
			loadedState.set(slug, {
				fetchedCount: data.length,
				totalCount: null, // Would come from API if available
				lastFetch: now
			})

			return // Promise resolved
		} catch (error) {
			console.error(`Failed to load subset for ${slug}:`, error)
			throw error
		}
	}

	/**
	 * Check if subset is loaded without triggering fetch
	 */
	collection.isSubsetLoaded = ({ where, limit = 20 }) => {
		const slug = extractParams(where)
		if (!slug) return false

		const existing = loadedState.get(slug)
		if (!existing) return false

		const now = Date.now()
		const isStale = now - existing.lastFetch > ttl
		const hasEnough = existing.fetchedCount >= limit

		return hasEnough && !isStale
	}

	/**
	 * Manually refresh a subset (force refetch)
	 */
	collection.refreshSubset = async (slug) => {
		loadedState.delete(slug)
		// Next loadSubset call will refetch
	}

	/**
	 * Get loaded state for debugging
	 */
	collection.getLoadedState = () => {
		return new Map(loadedState)
	}

	return collection
}
