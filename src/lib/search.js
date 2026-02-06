import fuzzysort from 'fuzzysort'
import {sdk} from '@radio4000/sdk'
import {channelsCollection} from '$lib/tanstack/collections'
export {buildFtsFilter, searchChannels, searchTracks} from '$lib/search-fts'
import {searchChannels, searchTracks} from '$lib/search-fts'

/**
 * Parse @mention syntax: "@ko002 jazz" or "@a @b house"
 * @param {string} query
 */
export function parseMentionQuery(query) {
	const parts = query.trim().split(/\s+/).filter(Boolean)
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
async function findChannelBySlug(slug) {
	const local = [...channelsCollection.state.values()].find((c) => c.slug === slug)
	if (local) return local
	const {data} = await sdk.channels.readChannel(slug)
	return data ?? undefined
}

/**
 * Main search - remote only
 * @param {string} query
 * @param {{limit?: number}} options
 * @returns {Promise<{channels: import('$lib/types').Channel[], tracks: import('$lib/types').Track[]}>}
 */
export async function searchAll(query, {limit = 100} = {}) {
	if (query.trim().length < 2) return {channels: [], tracks: []}

	if (query.includes('@')) {
		const {channelSlugs, trackQuery} = parseMentionQuery(query)
		const channelResults = await Promise.all(channelSlugs.map(findChannelBySlug))
		const channels = /** @type {import('$lib/types').Channel[]} */ (channelResults.filter((c) => c !== undefined))
		if (!trackQuery) return {channels, tracks: []}
		const results = await Promise.all(channelSlugs.map((slug) => searchTracks(trackQuery, {limit, channelSlug: slug})))
		return {channels, tracks: results.flat()}
	}

	const [channels, tracks] = await Promise.all([searchChannels(query, {limit}), searchTracks(query, {limit})])
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

export default {
	all: searchAll,
	channels: searchChannels,
	tracks: searchTracks,
	tracksLocal: searchTracksLocal,
	channelsLocal: searchChannelsLocal,
	fuzzy: fuzzySearch
}
