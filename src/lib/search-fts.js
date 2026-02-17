import {sdk} from '@radio4000/sdk'

/**
 * Pure FTS utilities — no collection deps, importable from anywhere.
 * search.js re-exports these and adds collection-dependent orchestration (searchAll).
 */

const RE_WEBSEARCH = /\bor\b|^-|\s-|"/
const RE_SPLIT_WORDS = /\s+/
const RE_NON_WORD = /[^\p{L}\p{N}]/gu
const RE_FILTER_CHARS = /[,()]/g
const RE_MULTI_SPACE = /\s+/g

/** Detect websearch operators that would break prefix syntax */
const hasWebsearchSyntax = (q) => RE_WEBSEARCH.test(q.toLowerCase())

/** Convert query to prefix format: "jazz house" → "jazz:* & house:*" */
const toPrefix = (q) => {
	if (hasWebsearchSyntax(q)) return null
	const words = q
		.trim()
		.split(RE_SPLIT_WORDS)
		.map((w) => w.replace(RE_NON_WORD, ''))
		.filter(Boolean)
	if (!words.length) return null
	return words.map((w) => `${w}:*`).join(' & ')
}

/** Sanitize query for PostgREST filter syntax (commas and parens break parsing) */
const sanitizeForFilter = (q) => q.replace(RE_FILTER_CHARS, ' ').replace(RE_MULTI_SPACE, ' ').trim()

/** Build FTS filter combining websearch + prefix */
export const buildFtsFilter = (query) => {
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
