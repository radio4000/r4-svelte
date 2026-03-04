import fuzzysort from 'fuzzysort'
import {sdk} from '@radio4000/sdk'
import {searchChannels, searchTracks} from '$lib/search-fts'
import {channelsCollection} from '$lib/collections/channels'
import {parseQuery} from '$lib/views'

const RE_WHITESPACE = /\s+/

/**
 * Parse @mention syntax: "@ko002 jazz" or "@a @b house"
 * @param {string} query
 */
export function parseMentionQuery(query) {
	const parts = query.trim().split(RE_WHITESPACE).filter(Boolean)
	const channelSlugs = []
	const trackQueryParts = []
	for (const part of parts) {
		if (part.startsWith('@') && part.length > 1) {
			channelSlugs.push(part.slice(1))
		} else {
			trackQueryParts.push(part)
		}
	}
	return {channelSlugs, trackQuery: trackQueryParts.join(' ')}
}

/**
 * Find channel by slug - tries local collection first, falls back to remote
 * @param {string} slug
 * @returns {Promise<import('$lib/types').Channel | undefined>}
 */
export async function findChannelBySlug(slug) {
	const normalizedSlug = String(slug || '')
		.trim()
		.toLowerCase()
	if (!normalizedSlug) return undefined
	const local = [...channelsCollection.state.values()].find(
		(c) =>
			String(c?.slug || '')
				.trim()
				.toLowerCase() === normalizedSlug
	)
	const localHasLocation = Number.isFinite(Number(local?.latitude)) && Number.isFinite(Number(local?.longitude))
	if (local && localHasLocation) return local
	const {data} = await sdk.channels.readChannel(normalizedSlug)
	return data ?? local ?? undefined
}

/**
 * Main search - remote only. Supports `@channel`, `#tag`, and free-text (FTS).
 * @param {string} query
 * @param {{limit?: number}} options
 * @returns {Promise<{channels: import('$lib/types').Channel[], tracks: import('$lib/types').Track[]}>}
 */
export async function searchAll(query, {limit = 100} = {}) {
	if (query.trim().length < 2) return {channels: [], tracks: []}

	const {channels: slugs = [], tags = [], search = ''} = parseQuery(query)
	const hasChannels = !!slugs.length
	const hasTags = !!tags.length
	const hasSearch = !!search

	if (!hasChannels && !hasTags && !hasSearch) return {channels: [], tracks: []}

	let channels = []
	let tracks = []

	if (hasChannels) {
		const results = await Promise.all(slugs.map(findChannelBySlug))
		channels = results.filter((c) => c !== undefined)

		if (hasSearch) {
			// FTS scoped to each channel
			const r = await Promise.all(slugs.map((slug) => searchTracks(search, {limit, channelSlug: slug})))
			tracks = r.flat()
		} else if (hasTags) {
			// Fetch tracks from channels filtered by tags
			const r = await Promise.all(
				slugs.map(async (slug) => {
					const {data} = await sdk.supabase
						.from('channel_tracks')
						.select('*')
						.eq('slug', slug)
						.overlaps('tags', tags)
						.order('created_at', {ascending: false})
						.limit(limit)
					return data ?? []
				})
			)
			tracks = r.flat()
		}
	} else if (hasTags && !hasSearch) {
		// Tags only: query by tag overlap
		const {data} = await sdk.supabase
			.from('channel_tracks')
			.select('*')
			.overlaps('tags', tags)
			.order('created_at', {ascending: false})
			.limit(limit)
		tracks = data ?? []
	} else if (hasSearch) {
		// Plain FTS (no channel/tag filter)
		const fts = await Promise.all([searchChannels(search, {limit}), searchTracks(search, {limit})])
		channels = fts[0]
		tracks = fts[1].tracks
	}

	// Post-filter by tags when we fetched via FTS (tags weren't part of the DB query)
	if (hasTags && hasSearch && tracks.length) {
		tracks = tracks.filter((t) => t.tags?.some((tag) => tags.includes(tag)))
	}

	return {channels, tracks}
}

// Local fuzzy search utils (pure functions for potential reuse)

/**
 * Generic fuzzy search
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {string[]} keys
 * @param {{limit?: number, threshold?: number}} options
 * @returns {T[]}
 */
export function fuzzySearch(query, items, keys, {limit = 100, threshold = 0.5} = {}) {
	if (!query?.trim()) return items
	return fuzzysort.go(query, items, {keys, limit, threshold}).map((r) => r.obj)
}

/**
 * Fuzzy search tracks locally
 * @param {string} query
 * @param {Array} tracks
 * @param {{limit?: number}} options
 */
export function searchTracksLocal(query, tracks, {limit = 100} = {}) {
	return fuzzySearch(query, tracks, ['title', 'description'], {limit})
}

/**
 * Fuzzy search channels locally
 * @param {string} query
 * @param {Array} channels
 * @param {{limit?: number}} options
 */
export function searchChannelsLocal(query, channels, {limit = 100} = {}) {
	return fuzzySearch(query, channels, ['name', 'slug', 'description'], {limit})
}
