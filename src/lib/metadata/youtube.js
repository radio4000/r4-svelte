import {mapChunked} from '$lib/async'
import {logger} from '$lib/logger'
import {trackMetaCollection} from '$lib/tanstack/collections'

const log = logger.ns('metadata/youtube').seal()

/** @param {string[]} mediaIds */
function getTracksToUpdate(mediaIds) {
	return mediaIds.filter((mediaId) => !trackMetaCollection.get(mediaId)?.youtube_data)
}

/**
 * Fetch YouTube metadata for channel tracks
 * @deprecated Use pullYouTubeSingle or pullYouTube instead
 * @param {string[]} mediaIds YouTube video IDs from channel tracks
 * @returns {Promise<Object[]>} Fetched metadata
 */
export async function pullFromChannel(mediaIds) {
	return await pullYouTube(mediaIds)
}

/**
 * Fetch YouTube metadata for single video and save to track_meta
 * @param {string} mediaId YouTube video ID
 * @returns {Promise<Object|null>} Fetched metadata
 */
export async function pullYouTubeSingle(mediaId) {
	const mediaIds = [mediaId]
	return (await pullYouTube(mediaIds))[0] || null
}

/**
 * Fetch a batch of YouTube metadata from the API
 * @param {string[]} ids YouTube video IDs
 * @param {AbortSignal} [signal]
 */
async function fetchBatch(ids, signal) {
	const response = await fetch('/api/track-meta', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({ids}),
		signal
	})
	if (!response.ok) throw new Error(`API error: ${response.status}`)
	return await response.json()
}

/**
 * @typedef {Object} PullProgressEvent
 * @property {number} current - Current batch number
 * @property {number} total - Total batches
 * @property {Array<{id: string, duration: number, title?: string}>} videos - Videos from this batch
 */

/**
 * Fetch YouTube metadata and save to track_meta collection
 * @param {string[]} mediaIds YouTube video IDs
 * @param {{signal?: AbortSignal, onProgress?: (event: PullProgressEvent) => void | Promise<void>}} [options]
 * @returns {Promise<Array<{id: string, duration: number, title?: string, [key: string]: unknown}>>} Fetched videos with metadata
 */
export async function pullYouTube(mediaIds, {signal, onProgress} = {}) {
	const toUpdate = getTracksToUpdate(mediaIds)
	if (toUpdate.length === 0) {
		log.info('all tracks already have metadata')
		return []
	}

	const videos = []
	const chunkSize = 50
	const totalBatches = Math.ceil(toUpdate.length / chunkSize)
	let currentBatch = 0

	for await (const result of mapChunked(toUpdate, fetchBatch, {chunk: chunkSize, concurrency: 3, signal})) {
		currentBatch++

		if (!result.ok) {
			log.warn('batch failed:', result.error.message)
			if (onProgress) {
				await onProgress({current: currentBatch, total: totalBatches, videos: []})
			}
			continue
		}

		const batchVideos = []
		for (const video of result.value) {
			if (!video?.duration) continue

			const existing = trackMetaCollection.get(video.id)
			if (existing) {
				trackMetaCollection.update(video.id, (draft) => {
					draft.youtube_data = video
				})
			} else {
				trackMetaCollection.insert({media_id: video.id, youtube_data: video})
			}
			videos.push(video)
			batchVideos.push(video)
		}

		if (onProgress) {
			await onProgress({current: currentBatch, total: totalBatches, videos: batchVideos})
		}
	}

	log.info(`processed ${toUpdate.length} media_ids, got ${videos.length} videos`)
	return videos
}
