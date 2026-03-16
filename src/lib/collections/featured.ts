import {channelsCollection, loadMoreChannels} from '$lib/collections/channels'
import {fetchRecentTracksForSlugs} from '$lib/collections/tracks'
import {featuredScore} from '$lib/utils'
import type {Channel} from '$lib/types'

/**
 * Load the quality channel pool into channelsCollection and return it.
 * Filters to channels with 10+ tracks, artwork, and activity within `days`.
 */
export async function getFeaturedPool(days = 30): Promise<Channel[]> {
	await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
	try {
		await loadMoreChannels({
			trackCountGte: 10,
			imageNotNull: true,
			limit: 200,
			offset: 0,
			orderColumn: 'latest_track_at',
			ascending: false
		})
	} catch (e) {
		console.warn('[featured] failed to load channel pool', e)
	}
	const since = new Date(Date.now() - days * 86400000).toISOString()
	return [...channelsCollection.state.values()].filter(
		(ch) => (ch.track_count ?? 0) >= 10 && ch.image && ch.latest_track_at && ch.latest_track_at >= since
	) as Channel[]
}

/**
 * Load top `count` featured channels by score and fetch their recent tracks.
 * Results land in tracksCollection.state — read from there after awaiting.
 * Returns the picked channels.
 */
export async function loadFeaturedChannelTracks(count = 3, days = 30): Promise<Channel[]> {
	const pool = await getFeaturedPool(days)
	const since = new Date(Date.now() - days * 86400000).toISOString()
	const picked = pool.toSorted((a, b) => featuredScore(b) - featuredScore(a)).slice(0, count)
	if (picked.length) {
		await fetchRecentTracksForSlugs(
			picked.map((ch) => ch.slug),
			since
		)
	}
	return picked
}
