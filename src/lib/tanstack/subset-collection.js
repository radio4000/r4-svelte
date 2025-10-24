import {createCollection} from '@tanstack/db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {r5} from '$lib/r5'

/**
 * Creates a collection that supports on-demand subset loading
 * Implements naive version of TanStack DB RFC #676 loadSubset pattern
 *
 * Uses localStorageCollection as base for persistence across refreshes
 */
export function createSubsetCollection(config) {
	const {id, getKey, extractSlug, fetchData, storageKey, ...restConfig} = config

	// Track which slugs have been loaded (also persist this to localStorage)
	const loadedSlugsKey = `${storageKey}-loaded-slugs`
	const loadedSlugs = new Set(JSON.parse(localStorage.getItem(loadedSlugsKey) || '[]'))

	// Create a localStorage collection (persists data)
	const collection = createCollection(
		localStorageCollectionOptions({
			id,
			storageKey,
			getKey,
			...restConfig
		})
	)

	// Define loadSubset function
	const loadSubset = async ({where, limit}) => {
		console.log('[loadSubset] called with:', {where, limit})

		// Extract slug from where predicate
		const slug = extractSlug ? extractSlug(where) : null

		if (!slug) {
			console.warn('[loadSubset] Could not extract slug from predicate')
			return true // Skip loading if we can't determine what to load
		}

		// Already loaded? Return synchronously
		if (loadedSlugs.has(slug)) {
			console.log(`[loadSubset] ${slug} already loaded, returning true`)
			return true
		}

		console.log(`[loadSubset] Loading ${slug}...`)

		try {
			// Fetch data
			const items = await fetchData(slug, limit)

			console.log(`[loadSubset] Fetched ${items.length} items for ${slug}`)

			// Insert into collection
			items.forEach((item) => {
				collection.insert(item)
			})

			// Mark as loaded and persist to localStorage
			loadedSlugs.add(slug)
			localStorage.setItem(loadedSlugsKey, JSON.stringify(Array.from(loadedSlugs)))

			console.log(`[loadSubset] Successfully loaded ${slug}`)
		} catch (error) {
			console.error(`[loadSubset] Failed to load ${slug}:`, error)
			throw error
		}
	}

	// Store loadSubset on the collection object for easy access
	collection.loadSubset = loadSubset

	return collection
}

/**
 * Extract channel slug from TanStack DB where predicate
 * This is a naive implementation - we'll refine based on actual predicate shape
 */
export function extractChannelSlug(where) {
	if (!where) return null

	// Log the predicate to understand its shape
	console.log('[extractChannelSlug] where predicate:', where)
	console.log('[extractChannelSlug] type:', typeof where)
	console.log('[extractChannelSlug] keys:', where && typeof where === 'object' ? Object.keys(where) : 'N/A')

	// TODO: Parse actual predicate structure
	// For now, return null and we'll debug the actual shape
	return null
}

/**
 * Create tracks collection with on-demand loading
 */
export function createTracksCollection() {
	return createSubsetCollection({
		id: 'tracks',
		storageKey: 'r5-tracks-subset',
		getKey: (track) => track.id,
		extractSlug: extractChannelSlug,
		fetchData: async (slug, limit) => {
			return await r5.tracks.pull({slug, limit})
		}
	})
}
