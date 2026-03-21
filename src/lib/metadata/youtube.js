import {mapChunked} from '$lib/async'
import {logger} from '$lib/logger'
import {trackMetaCollection, trackMetaKey} from '$lib/collections/track-meta'

const log = logger.ns('metadata/youtube').seal()

/** @param {Array<{provider?: string | null, mediaId: string}>} tracks */
function getTracksToUpdate(tracks) {
	return tracks.filter(
		(track) => !trackMetaCollection.get(trackMetaKey(track.provider, track.mediaId))?.youtube_data
	)
}

/**
 * Fetch YouTube metadata for channel tracks
 * @deprecated Use pullYouTubeSingle or pullYouTube instead
 * @param {string[]} mediaIds YouTube video IDs from channel tracks
 * @returns {Promise<Object[]>} Fetched metadata
 */
export async function pullFromChannel(mediaIds) {
	return await pullYouTube(mediaIds.map((mediaId) => ({provider: 'youtube', mediaId})))
}

/**
 * Fetch YouTube metadata for single video and save to track_meta
 * @param {string} mediaId YouTube video ID
 * @returns {Promise<Object|null>} Fetched metadata
 */
export async function pullYouTubeSingle(mediaId) {
	const tracks = [{provider: 'youtube', mediaId}]
	return (await pullYouTube(tracks))[0] || null
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
	if (!response.ok) {
		let details = ''
		try {
			const body = await response.json()
			details = body?.error || JSON.stringify(body)
		} catch {
			try {
				details = await response.text()
			} catch {
				// ignore secondary parse failures
			}
		}
		throw new Error(`API error: ${response.status}${details ? ` - ${details}` : ''}`)
	}
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
 * @param {Array<{provider?: string | null, mediaId: string}>} tracks YouTube media references
 * @param {{signal?: AbortSignal, onProgress?: (event: PullProgressEvent) => void | Promise<void>}} [options]
 * @returns {Promise<Array<{id: string, duration: number, title?: string, [key: string]: unknown}>>} Fetched videos with metadata
 */
export async function pullYouTube(tracks, {signal, onProgress} = {}) {
	const toUpdate = getTracksToUpdate(tracks)
	if (toUpdate.length === 0) {
		log.info('all tracks already have metadata')
		return []
	}

	const videos = []
	const errors = []
	const chunkSize = 50
	const totalBatches = Math.ceil(toUpdate.length / chunkSize)
	let currentBatch = 0

	for await (const result of mapChunked(
		toUpdate.map((track) => track.mediaId),
		fetchBatch,
		{chunk: chunkSize, concurrency: 3, signal}
	)) {
		currentBatch++

		if (!result.ok) {
			log.warn('batch failed:', result.error.message)
			errors.push(result.error)
			if (onProgress) {
				await onProgress({current: currentBatch, total: totalBatches, videos: []})
			}
			continue
		}

		const batchVideos = []
		for (const video of result.value) {
			if (!video?.duration) continue

			const key = trackMetaKey('youtube', video.id)
			const existing = trackMetaCollection.get(key)
			if (existing) {
				trackMetaCollection.update(key, (draft) => {
					draft.provider = 'youtube'
					draft.youtube_data = video
				})
			} else {
				trackMetaCollection.insert({provider: 'youtube', media_id: video.id, youtube_data: video})
			}
			videos.push(video)
			batchVideos.push(video)
		}

		if (onProgress) {
			await onProgress({current: currentBatch, total: totalBatches, videos: batchVideos})
		}
	}

	log.info(`processed ${toUpdate.length} media_ids, got ${videos.length} videos`)

	if (videos.length === 0 && errors.length > 0) {
		throw errors[0]
	}

	return videos
}
