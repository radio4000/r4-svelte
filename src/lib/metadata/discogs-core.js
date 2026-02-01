import {logger} from '$lib/logger'

const log = logger.ns('metadata/discogs').seal()

/**
 * Parse a Discogs URL to extract resource type and ID
 * @param {string} url
 * @returns {{type: string, id: string} | null}
 */
export function parseDiscogsUrl(url) {
	if (!url) return null

	// Handle different Discogs URL formats
	const patterns = [
		/discogs\.com\/([^/]+)\/([^/]+)\/(\d+)/, // new format: /master/release/123
		/discogs\.com\/([^/]+)\/(\d+)/ // old format: /release/123
	]

	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match) {
			if (match[3]) {
				// Three-part match: type, subtype, id
				return {type: match[2], id: match[3]}
			} else {
				// Two-part match: type, id
				return {type: match[1], id: match[2]}
			}
		}
	}

	return null
}

/**
 * Fetch Discogs data without saving
 * @param {string} discogsUrl Discogs URL
 * @returns {Promise<Object|null>} Discogs data
 */
export async function fetchDiscogs(discogsUrl) {
	const parsed = parseDiscogsUrl(discogsUrl)
	if (!parsed) return null

	const {type, id} = parsed
	const apiUrl = `https://api.discogs.com/${type}s/${id}`

	try {
		const response = await fetch(apiUrl, {
			headers: {
				'User-Agent': 'R5MusicPlayer/1.0'
			}
		})

		if (!response.ok) {
			log.error('api error', {status: response.status, statusText: response.statusText})
			return null
		}

		const data = await response.json()
		return {
			...data,
			// Add metadata about the fetch
			_meta: {
				sourceUrl: discogsUrl,
				apiUrl,
				fetchedAt: new Date().toISOString()
			}
		}
	} catch (error) {
		log.error('fetch failed', {discogsUrl, apiUrl, error})
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
 * Search MusicBrainz for recordings matching title
 */
export async function searchMusicBrainzRecording(title) {
	// Clean title for better matching
	const cleanTitle = title
		.replace(/\s*\([^)]+\)$/, '') // remove (feat. etc)
		.replace(/\s*\[[^\]]+\]$/, '') // remove [remix etc]
		.trim()

	// Extract artist - title pattern
	const parts = cleanTitle.split(' - ')
	let query = `recording:"${cleanTitle}"`

	if (parts.length >= 2) {
		const [artist, track] = parts
		query = `artist:"${artist.trim()}" AND recording:"${track.trim()}"`
	}

	const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`

	try {
		const response = await fetch(url, {
			headers: {'User-Agent': 'R5MusicPlayer/1.0 (contact@radio4000.com)'}
		})

		if (!response.ok) return null

		const data = await response.json()

		if (data.recordings?.length > 0) {
			log.info('musicbrainz found recordings', {count: data.count, title})
		}

		return data.recordings?.[0] || null
	} catch (error) {
		log.error('musicbrainz recording search failed', {error})
		return null
	}
}

/**
 * Get releases for a recording ID
 */
export async function getMusicBrainzReleases(recordingId) {
	const url = `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=releases&fmt=json`

	try {
		const response = await fetch(url, {
			headers: {'User-Agent': 'R5MusicPlayer/1.0 (contact@radio4000.com)'}
		})

		if (!response.ok) return []

		const data = await response.json()
		return data.releases || []
	} catch (error) {
		log.error('musicbrainz releases fetch failed', {error})
		return []
	}
}

/**
 * Extract Discogs URL from release relationships
 */
export async function getDiscogsUrlFromRelease(releaseId) {
	const url = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=url-rels&fmt=json`

	try {
		const response = await fetch(url, {
			headers: {'User-Agent': 'R5MusicPlayer/1.0 (contact@radio4000.com)'}
		})

		if (!response.ok) return null

		const data = await response.json()
		const urlRels = data.relations?.filter(
			(rel) => rel.type === 'discogs' && rel.url?.resource?.includes('discogs.com')
		)

		return urlRels?.[0]?.url?.resource || null
	} catch (error) {
		log.error('discogs url extraction failed', {error})
		return null
	}
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
