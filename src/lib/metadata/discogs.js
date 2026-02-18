import {discoverDiscogsUrl} from 'media-now'
import {logger} from '$lib/logger'
import {trackMetaCollection, tracksCollection, updateTrack} from '$lib/tanstack/collections'
import {fetchDiscogs, searchUrl, extractSuggestions} from './discogs-core.js'

// Re-export pure functions
export {fetchDiscogs, searchUrl, extractSuggestions}

const log = logger.ns('metadata/discogs').seal()

/**
 * Fetch Discogs data from URL and save to track_meta collection
 * @param {string} mediaId YouTube video ID
 * @param {string} discogsUrl Discogs release/master URL
 * @returns {Promise<Object|null>} Discogs data
 */
export async function pullDiscogs(mediaId, discogsUrl) {
	if (!mediaId || !discogsUrl) return null

	const discogsData = await fetchDiscogs(discogsUrl)
	if (!discogsData) return null

	try {
		const existing = trackMetaCollection.get(mediaId)
		if (existing) {
			trackMetaCollection.update(mediaId, (draft) => {
				draft.discogs_data = discogsData
			})
		} else {
			trackMetaCollection.insert({media_id: mediaId, discogs_data: discogsData})
		}
		log.info('updated', discogsData)
		return discogsData
	} catch (error) {
		log.error('insert failed', {mediaId, discogsUrl, error})
		return null
	}
}

/**
 * Hunt for Discogs URL via MusicBrainz and save URL to tracks collection
 * @param {string} trackId Track UUID
 * @param {string} _mediaId Media ID (unused, kept for API compatibility)
 * @param {string} title Track title for search
 * @returns {Promise<string|null>} Discovered Discogs URL
 */
export async function huntDiscogs(trackId, _mediaId, title) {
	if (!title) return null

	try {
		log.info('discovering discogs url', {title})
		const discogsUrl = await discoverDiscogsUrl(title)
		if (discogsUrl) {
			await saveDiscogsUrl(trackId, discogsUrl)
			return discogsUrl
		}
		return null
	} catch (error) {
		log.error('discogs hunt failed', {title, error})
		return null
	}
}

/**
 * Save discovered Discogs URL to track via tracksCollection
 * @param {string} trackId Track UUID
 * @param {string} discogsUrl Discovered Discogs URL
 */
async function saveDiscogsUrl(trackId, discogsUrl) {
	if (!trackId || !discogsUrl) return false

	try {
		// Look up the track to get its channel slug
		const track = tracksCollection.get(trackId)
		if (!track?.slug) {
			log.warn('track not found or missing slug', {trackId})
			return false
		}

		// Update via offline transaction (syncs to server)
		await updateTrack({id: trackId, slug: track.slug}, trackId, {discogs_url: discogsUrl})
		log.info('saved discogs url', {trackId})
		return true
	} catch (error) {
		log.error('save discogs url failed', {trackId, discogsUrl, error})
		return false
	}
}

/**
 * Test the chain with a known track
 */
export async function testAutoDiscovery() {
	const title = 'Daft Punk - Get Lucky'
	log.info('testing auto-discovery', {title})

	const discogsUrl = await discoverDiscogsUrl(title)
	log.info('test result', {discogsUrl})

	return discogsUrl
}
