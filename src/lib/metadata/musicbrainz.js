import {logger} from '$lib/logger'
import {trackMetaCollection} from '$lib/tanstack/collections'

const log = logger.ns('metadata/musicbrainz').seal()

/**
 * Search MusicBrainz and save to track_meta collection
 * @param {string} mediaId YouTube video ID
 * @param {string} title Track title to search
 * @returns {Promise<Object|null>} MusicBrainz data
 */
export async function pullMusicBrainz(mediaId, title) {
	if (!mediaId || !title) return null

	const musicbrainzData = await search(title)
	if (!musicbrainzData) return null

	try {
		const existing = trackMetaCollection.get(mediaId)
		if (existing) {
			trackMetaCollection.update(mediaId, (draft) => {
				draft.musicbrainz_data = musicbrainzData
			})
		} else {
			trackMetaCollection.insert({media_id: mediaId, musicbrainz_data: musicbrainzData})
		}
		log.info('updated', musicbrainzData)
		return musicbrainzData
	} catch (error) {
		log.error('insert failed', {mediaId, error})
		return null
	}
}

const RE_SEPARATORS = /\s*(\/\/|\\\\|\|\||--)\s*.+$/
const RE_PARENS = /\s*\([^)]+\)$/
const RE_BRACKETS = /\s*\[[^\]]+\]$/
const RE_FEAT = /\s*(feat\.?|ft\.?|featuring|with)\s+.+$/i
const RE_REMIX = /\s*(remix|edit|version|mix|dub)\s*.+$/i

function cleanTitle(title) {
	return title
		.replace(RE_SEPARATORS, '')
		.replace(RE_PARENS, '')
		.replace(RE_BRACKETS, '')
		.replace(RE_FEAT, '')
		.replace(RE_REMIX, '')
		.trim()
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
