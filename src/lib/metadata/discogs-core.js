import {getMedia} from 'media-now'
import {logger} from '$lib/logger'

const log = logger.ns('metadata/discogs').seal()

/** In-memory cache: url → {data, ts} — avoids repeat API hits within a session */
const fetchCache = new Map()
/** In-flight requests: url → promise — avoids duplicate concurrent API hits */
const inFlight = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch Discogs data without saving
 * @param {string} discogsUrl Discogs URL
 * @returns {Promise<Object|null>} Discogs data
 */
export async function fetchDiscogs(discogsUrl) {
	const key = discogsUrl?.trim()
	if (!key) return null

	const cached = fetchCache.get(key)
	if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

	const pending = inFlight.get(key)
	if (pending) return pending

	const request = (async () => {
		try {
			const result = await getMedia(key)
			if (!result?.payload) return null
			const data = {
				...result.payload,
				_meta: {fetchedAt: new Date().toISOString(), sourceUrl: key}
			}
			fetchCache.set(key, {data, ts: Date.now()})
			return data
		} catch (error) {
			log.error('fetch failed', {discogsUrl: key, error})
			return null
		} finally {
			inFlight.delete(key)
		}
	})()

	inFlight.set(key, request)
	return request
}

/**
 * Search Discogs by title (for future automatic search)
 * @param {string} title
 * @returns {{searchUrl: string, query: string} | null} Search URL object
 */
export function searchUrl(title) {
	if (!title) return null

	// Use the web search interface instead of API (which requires auth)
	// This doesn't return structured JSON, but can be used for building search URLs
	const query = encodeURIComponent(title)
	const searchUrl = `https://discogs.com/search?q=${query}&type=release`

	// For now, just return the search URL - we could scrape this later if needed
	// But the main use case is manual discogs_url entry anyway
	return {searchUrl, query: title}
}

/**
 * Extract tag suggestions from Discogs resource data
 * @param {{year?: number, genres?: string[], styles?: string[], labels?: {name: string}[]}} resource
 * @returns {string[]}
 */
export function extractSuggestions({year = 0, genres = [], styles = [], labels = []}) {
	const labelNames = labels?.map(({name}) => name) || []
	const suggestions = [...genres, ...styles, year, ...labelNames]
		.filter((s) => !!s)
		.map((s) => s.toString().replaceAll(' ', '-').toLowerCase())
	return [...new Set(suggestions)]
}
