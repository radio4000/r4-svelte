import {error, json} from '@sveltejs/kit'
import {Duration} from 'luxon'
import {env} from '$env/dynamic/private'

// This is our only API endpoint in the app. Only piece of server code. Consider migrating to api.radio4000.com
//
// Assuming you have httpie installed in your terminal:
// http POST localhost:5173/api/track-meta ids:='["dQw4w9WgXcQ", "pjeUbWj6k"]'

/** @type {import('./$types').RequestHandler} */
export async function POST({request}) {
	if (!env.YOUTUBE_API_KEY) error(503, 'YouTube API not configured')

	const {ids} = await request.json()
	if (!ids || ids.length === 0) error(400, 'No YouTube IDs provided')
	if (ids.length > 50) error(400, 'Cannot process more than 50 YouTube IDs at once')

	try {
		const videoIds = ids.join(',')
		const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${env.YOUTUBE_API_KEY}`

		const response = await fetch(url)
		const data = await response.json()
		if (!response.ok)
			return json({error: data.error?.message || 'YouTube API error'}, {status: response.status})

		const videos = data.items.map((item) => ({
			id: item.id,
			title: item.snippet.title,
			channelTitle: item.snippet.channelTitle,
			publishedAt: item.snippet.publishedAt,
			duration: parseDurationToSeconds(item.contentDetails.duration),
			description: item.snippet.description,
			thumbnails: item.snippet.thumbnails,
			categoryId: item.snippet.categoryId,
			tags: item.snippet.tags || []
		}))

		return json(videos)
	} catch (err) {
		error(500, `Failed to fetch track metadata: ${err.message}`)
	}
}

/**
 * The "duration" is a special string youtube uses.. "pomerian durationss"
 * @param {string} duration
 **/
function parseDurationToSeconds(duration) {
	const luxonDuration = Duration.fromISO(duration)
	return luxonDuration.as('seconds')
}
