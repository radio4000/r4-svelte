import {logger} from '$lib/logger'
import {trackMetaCollection} from '$lib/collections'

const log = logger.ns('metadata/musicbrainz').seal()

/**
 * Search MusicBrainz and save to trackMetaCollection
 * @param {string} ytid YouTube video ID
 * @param {string} title Track title to search
 * @returns {Promise<Object|null>} MusicBrainz data
 */
export async function pull(ytid, title) {
	if (!ytid || !title) return null

	const musicbrainzData = await search(title)
	if (!musicbrainzData) return null

	try {
		const now = new Date().toISOString()
		const existing = trackMetaCollection.toArray.find((m) => m.ytid === ytid)

		if (existing) {
			trackMetaCollection.update(ytid, (draft) => {
				draft.musicbrainz_data = musicbrainzData
				draft.musicbrainz_updated_at = now
				draft.updated_at = now
			})
		} else {
			trackMetaCollection.insert({
				ytid,
				musicbrainz_data: musicbrainzData,
				musicbrainz_updated_at: now,
				updated_at: now,
				duration: null,
				youtube_data: null,
				youtube_updated_at: null,
				discogs_data: null,
				discogs_updated_at: null
			})
		}

		log.info('updated', musicbrainzData)
		return musicbrainzData
	} catch (error) {
		log.error('insert failed', {ytid, error})
		return null
	}
}

function cleanTitle(title) {
	return (
		title
			// Remove everything after // or similar separators (album info, etc.)
			.replace(/\s*(\/\/|\\\\|\|\||--)\s*.+$/, '')
			// Remove parenthetical info at end
			.replace(/\s*\([^)]+\)$/, '')
			// Remove bracketed info at end
			.replace(/\s*\[[^\]]+\]$/, '')
			// Remove feat/featuring info
			.replace(/\s*(feat\.?|ft\.?|featuring|with)\s+.+$/i, '')
			// Remove remix/edit info
			.replace(/\s*(remix|edit|version|mix|dub)\s*.+$/i, '')
			.trim()
	)
}

function parseTrackTitle(title) {
	const cleanedTitle = cleanTitle(title)

	// Try different separators
	const separators = [' - ', ' – ', ': ', ' | ', ' by ']

	for (const sep of separators) {
		const parts = cleanedTitle.split(sep)
		if (parts.length === 2) {
			return {
				artist: parts[0].trim(),
				title: parts[1].trim(),
				cleaned: cleanedTitle
			}
		}
	}

	return {
		artist: null,
		title: cleanedTitle,
		cleaned: cleanedTitle
	}
}

/**
 * Search MusicBrainz API without saving
 * @param {string} title Track title to search
 * @returns {Promise<Object|null>} Search results
 */
export async function search(title) {
	if (!title) return null

	const parsed = parseTrackTitle(title)

	// Try multiple search strategies in order of specificity
	const searchStrategies = []

	if (parsed.artist) {
		// Strategy 1: Exact artist and title search
		searchStrategies.push({
			query: `artist:"${parsed.artist}" AND recording:"${parsed.title}"`,
			description: `Artist: "${parsed.artist}" + Title: "${parsed.title}"`
		})

		// Strategy 2: Fuzzy artist and title search
		searchStrategies.push({
			query: `artist:${parsed.artist} AND recording:${parsed.title}`,
			description: `Fuzzy artist + title search`
		})
	}

	// Strategy 3: Just title search (exact)
	searchStrategies.push({
		query: `recording:"${parsed.title}"`,
		description: `Title only: "${parsed.title}"`
	})

	// Strategy 4: Just title search (fuzzy)
	searchStrategies.push({
		query: `recording:${parsed.title}`,
		description: `Fuzzy title search`
	})

	// Try each strategy until we get a good result
	for (const strategy of searchStrategies) {
		try {
			const encodedQuery = encodeURIComponent(strategy.query)
			const response = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodedQuery}&fmt=json&limit=1`)

			if (response.ok) {
				const data = await response.json()
				if (data.recordings && data.recordings.length > 0) {
					return {
						recording: data.recordings[0], // Just return the best match
						searchQuery: strategy.query,
						searchDescription: strategy.description,
						parsed,
						originalTitle: title
					}
				}
			}
		} catch (error) {
			log.error('search strategy failed', {query: strategy.query, error})
		}
	}

	return null
}

/**
 * Read MusicBrainz metadata from local trackMetaCollection
 * @param {string[]} ytids YouTube video IDs
 * @returns {Promise<Object[]>} Local metadata
 */
export async function local(ytids) {
	return trackMetaCollection.toArray.filter((m) => ytids.includes(m.ytid) && m.musicbrainz_data !== null)
}
