import {logger} from '$lib/logger'
import {trackMetaCollection, tracksCollection, updateTrack} from '../../routes/tanstack/collections'
import {
	parseDiscogsUrl,
	fetchDiscogs,
	searchUrl,
	searchMusicBrainzRecording,
	getMusicBrainzReleases,
	getDiscogsUrlFromRelease
} from './discogs-core.js'

// Re-export pure functions
export {parseDiscogsUrl, fetchDiscogs, searchUrl}

const log = logger.ns('metadata/discogs').seal()

/**
 * Fetch Discogs data from URL and save to track_meta collection
 * @param {string} ytid YouTube video ID
 * @param {string} discogsUrl Discogs release/master URL
 * @returns {Promise<Object|null>} Discogs data
 */
export async function pull(ytid, discogsUrl) {
	if (!ytid || !discogsUrl) return null

	const discogsData = await fetchDiscogs(discogsUrl)
	if (!discogsData) return null

	try {
		const existing = trackMetaCollection.get(ytid)
		if (existing) {
			trackMetaCollection.update(ytid, (draft) => {
				draft.discogs_data = discogsData
			})
		} else {
			trackMetaCollection.insert({ytid, discogs_data: discogsData})
		}
		log.info('updated', discogsData)
		return discogsData
	} catch (error) {
		log.error('insert failed', {ytid, discogsUrl, error})
		return null
	}
}

/**
 * Hunt for Discogs URL via MusicBrainz chain and save URL to tracks collection
 * @param {string} trackId Track UUID
 * @param {string} ytid YouTube video ID
 * @param {string} title Track title for search
 * @returns {Promise<string|null>} Discovered Discogs URL
 */
export async function hunt(trackId, ytid, title) {
	if (!ytid || !title) return null

	try {
		// Check if we already have MusicBrainz data locally
		const meta = trackMetaCollection.get(ytid)
		/** @type {{recording?: {releases?: {id?: string}[]}} | undefined} */
		const musicbrainzData = /** @type {any} */ (meta?.musicbrainz_data)

		// If we have cached MusicBrainz data with releases, use it
		if (musicbrainzData?.recording?.releases?.length) {
			log.info('using cached musicbrainz data', {title})
			// Check each release for Discogs URL
			for (const release of musicbrainzData.recording.releases) {
				if (release.id) {
					const discogsUrl = await getDiscogsUrlFromRelease(release.id)
					if (discogsUrl) {
						await saveDiscogsUrl(trackId, discogsUrl)
						return discogsUrl
					}
				}
			}
		}

		// Otherwise, do fresh search
		log.info('searching musicbrainz', {title})

		// Step 1: Search for recording by title
		const recording = await searchMusicBrainzRecording(title)
		if (!recording) return null

		// Step 2: Get releases for this recording
		const releases = await getMusicBrainzReleases(recording.id)
		if (!releases.length) return null

		// Step 3: Find discogs URL in release relationships
		for (const release of releases) {
			const discogsUrl = await getDiscogsUrlFromRelease(release.id)
			if (discogsUrl) {
				await saveDiscogsUrl(trackId, discogsUrl)
				return discogsUrl
			}
		}

		return null
	} catch (error) {
		log.error('discogs hunt failed', {ytid, title, error})
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
	log.info('testing auto-discovery', {track: 'Daft Punk - Get Lucky'})

	const discogsUrl = await hunt('test-track-id', '09m-zZN-tOQ', 'Daft Punk - Get Lucky')
	log.info('test result', {discogsUrl})

	return discogsUrl
}
