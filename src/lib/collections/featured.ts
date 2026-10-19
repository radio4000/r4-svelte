import {channelsCollection} from '#lib/collections/channels.js'
import {queryClient} from '#lib/collections/query-client.js'
import {fetchRecentTracksForSlugs} from '#lib/collections/tracks.js'
import {sdk} from '@radio4000/sdk'
import {featuredScore, seededRandom, shuffleArray} from '#lib/utils.js'
import {daysAgoIso} from '#lib/dates.js'
import type {Channel, Track} from '#lib/types.js'

/** Today as a stable seed (YYYY-MM-DD) for daily-rotating picks. */
export function dailySeed(): string {
	return new Date().toISOString().slice(0, 10)
}

/**
 * Pick featured channels from a pool: score a quality window, then shuffle it
 * down to `count`. Pass a stable `seed` (e.g. dailySeed()) for daily rotation,
 * or a random one to reshuffle. Without a seed, picks randomly each call.
 * Shared by the homepage and the /featured explore page so both rotate alike.
 */
export function pickFeatured(
	pool: Channel[],
	{count = 12, window = 40, seed}: {count?: number; window?: number; seed?: string} = {}
): Channel[] {
	const top = pool
		.toSorted((a, b) => featuredScore(b) - featuredScore(a))
		.slice(0, Math.max(window, count))
	return shuffleArray(top, seed ? seededRandom(seed) : Math.random).slice(0, count)
}

/**
 * Load the quality channel pool and return it.
 * Fetches via queryClient (cached, respects staleTime) and writes into
 * channelsCollection so other parts of the app can use these channels.
 */
export async function getFeaturedPool(days = 30): Promise<Channel[]> {
	const since = daysAgoIso(days)
	try {
		const data = await queryClient.fetchQuery({
			// Not under ['channels']: channelsCollection tracks every query there, and the
			// upsert below would cancel this one mid-fetch (CancelledError, empty home)
			queryKey: ['featured-pool'],
			staleTime: 60 * 60 * 1000,
			queryFn: async () => {
				const {data, error} = await sdk.supabase
					.from('channels_with_tracks')
					.select('*')
					.gte('track_count', 10)
					.not('image', 'is', null)
					.order('latest_track_at', {ascending: false})
					.limit(200)
				if (error) throw error
				const channels = (data ?? []) as Channel[]
				// Upsert per fetch, not per call: home asks for the pool up to three
				// times on load, and each upsert of 200 rows wakes every live query.
				if (channels.length) {
					await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
					channelsCollection.utils.writeUpsert(channels)
				}
				return channels
			}
		})
		return data.filter((ch) => ch.latest_track_at && ch.latest_track_at >= since)
	} catch (e) {
		console.warn('[featured] failed to load channel pool', e)
		return []
	}
}

/**
 * Load the featured channel pool and fetch each channel's recent tracks.
 * Returns the pool channels (sorted by score) and their recent tracks
 * (newest first, also upserted into tracksCollection).
 */
export async function loadFeaturedChannelTracks(
	days = 30
): Promise<{channels: Channel[]; tracks: Track[]}> {
	const pool = await getFeaturedPool(days)
	const since = daysAgoIso(days)
	const picked = pool.toSorted((a, b) => featuredScore(b) - featuredScore(a))
	const tracks = picked.length
		? await fetchRecentTracksForSlugs(
				picked.map((ch) => ch.slug),
				since
			)
		: []
	return {channels: picked, tracks}
}
