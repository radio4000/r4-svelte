import {getMedia} from 'media-now'
import {logger} from '$lib/logger'

const log = logger.ns('metadata/discogs').seal()

/**
 * Fetch Discogs data without saving
 * @param {string} discogsUrl Discogs URL
 * @returns {Promise<Object|null>} Discogs data
 */
export async function fetchDiscogs(discogsUrl) {
	try {
		const result = await getMedia(discogsUrl)
		if (!result?.payload) return null
		return {
			...result.payload,
			_meta: {fetchedAt: new Date().toISOString()}
		}
	} catch (error) {
		log.error('fetch failed', {discogsUrl, error})
		return null
	}
}

/**
 * Search Discogs by title (for future automatic search)
 * @param {string} title
 * @returns {Promise<Object|null>} Search URL object
 */
export async function searchUrl(title) {
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
	return [...genres, ...styles, year, ...labelNames]
		.filter((s) => !!s)
		.map((s) => s.toString().replace(' ', '-').toLowerCase())
}
