import fuzzysort from 'fuzzysort'
import {sdk} from '@radio4000/sdk'
import {channelsCollection} from '$lib/tanstack/collections'

/**
 * Search channels and tracks using Supabase FTS.
 * Combines websearch (for natural language: "jazz or house", "radio -pop", "exact phrase")
 * with prefix matching (for partial matches: "ko00" finds "ko002").
 */

/** Detect websearch operators that would break prefix syntax */
const hasWebsearchSyntax = (q) => /\bor\b|^-|\s-|"/.test(q.toLowerCase())

/** Convert query to prefix format: "jazz house" → "jazz:* & house:*" */
const toPrefix = (q) => {
	if (hasWebsearchSyntax(q)) return null
	const words = q
		.trim()
		.split(/\s+/)
		.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
		.filter(Boolean)
	if (!words.length) return null
	return words.map((w) => w + ':*').join(' & ')
}

/** Sanitize query for PostgREST filter syntax (commas and parens break parsing) */
const sanitizeForFilter = (q) => q.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()

/** Build FTS filter combining websearch + prefix */
const buildFtsFilter = (query) => {
	const safe = sanitizeForFilter(query)
	if (!safe) return null
	const prefix = toPrefix(safe)
	let filter = `fts.wfts.${safe}`
	if (prefix) filter += `,fts.fts.${prefix}`
	return filter
}

/**
 * Search channels remotely
 * @param {string} query
 * @param {{limit?: number}} options
 * @returns {Promise<import('$lib/types').Channel[]>}
 */
export async function searchChannels(query, {limit = 100} = {}) {
	if (!query?.trim()) return []
	const filter = buildFtsFilter(query)
	if (!filter) return []
	const {data, error} = await sdk.supabase.from('channels_with_tracks').select('*').or(filter).limit(limit)
	if (error) throw new Error(error.message)
	return /** @type {import('$lib/types').Channel[]} */ (data ?? [])
}

/**
 * Search tracks remotely, optionally scoped to a channel
 * @param {string} query
 * @param {{limit?: number, channelSlug?: string}} options
 * @returns {Promise<import('$lib/types').Track[]>}
 */
export async function searchTracks(query, {limit = 100, channelSlug} = {}) {
	if (!query?.trim()) return []
	const filter = buildFtsFilter(query)
	if (!filter) return []
	let q = sdk.supabase.from('channel_tracks').select('*').or(filter).limit(limit)
	if (channelSlug) q = q.eq('slug', channelSlug)
	const {data, error} = await q
	if (error) throw new Error(error.message)
	return /** @type {import('$lib/types').Track[]} */ (data ?? [])
}

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
	// Fallback to remote
	const {data} = await sdk.supabase.from('channels_with_tracks').select('*').eq('slug', slug).single()
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
 * Fuzzy search tracks locally
 * @param {string} query
 * @param {Array} tracks
 * @param {{limit?: number}} options
 */
export function searchTracksLocal(query, tracks, {limit = 100} = {}) {
	return fuzzysort.go(query, tracks, {keys: ['title', 'description'], limit}).map((r) => r.obj)
}

/**
 * Fuzzy search channels locally
 * @param {string} query
 * @param {Array} channels
 * @param {{limit?: number}} options
 */
export function searchChannelsLocal(query, channels, {limit = 100} = {}) {
	return fuzzysort.go(query, channels, {keys: ['name', 'slug', 'description'], limit}).map((r) => r.obj)
}

export default {
	all: searchAll,
	channels: searchChannels,
	tracks: searchTracks,
	tracksLocal: searchTracksLocal,
	channelsLocal: searchChannelsLocal
}
