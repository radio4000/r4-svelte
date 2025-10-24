import {batcher} from '$lib/batcher'
import {logger} from '$lib/logger'
import {trackMetaCollection} from '$lib/collections'

/** @typedef {{status: string, value: {id: string, tags: string[], duration: number, title: string, categoryId: string, description: string, publishedAt: string}}} YouTubeVideo */

const log = logger.ns('metadata/youtube').seal()

/**
 * Fetch YouTube metadata for channel tracks and save to track_meta
 * @param {string} channelId Channel ID
 * @returns {Promise<Object[]>} Fetched metadata
 */
export async function pullFromChannel(channelId) {
	// Note: This function is deprecated - use pullSingle() directly with ytids
	// Keeping for backward compatibility
	log.warn('pullFromChannel is deprecated - use pullSingle() instead')
	return []
}

/**
 * Fetch YouTube metadata for single video and save to trackMetaCollection
 * @param {string} ytid YouTube video ID
 * @returns {Promise<Object|null>} Fetched metadata
 */
export async function pullSingle(ytid) {
	if (!ytid) return null

	// Check if already in collection
	const existing = trackMetaCollection.toArray.find((m) => m.ytid === ytid)
	if (existing?.youtube_data) {
		log.info('youtube data already cached', {ytid})
		return existing.youtube_data
	}

	// Fetch from API
	try {
		const response = await fetch('/api/track-meta', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({ids: [ytid]})
		})

		if (!response.ok) throw new Error(`API error: ${response.status}`)

		const result = await response.json()
		const video = result.value?.[0]

		if (!video?.duration) {
			log.warn('no video data returned', {ytid})
			return null
		}

		// Insert or update in collection
		const meta = {
			ytid: video.id,
			duration: video.duration,
			youtube_data: video,
			youtube_updated_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}

		if (existing) {
			trackMetaCollection.update(ytid, () => meta)
		} else {
			trackMetaCollection.insert(meta)
		}

		log.info('fetched youtube metadata', {ytid})
		return video
	} catch (error) {
		log.error('fetch failed', {ytid, error})
		return null
	}
}
