import {createLiveQueryCollection, gte, isNull, not} from '@tanstack/db'
import {channelsCollection} from '#lib/collections/channels.js'
import {featuredScore, seededRandom, shuffleArray} from '#lib/utils.js'
import {daysAgoIso} from '#lib/dates.js'
import type {Channel} from '#lib/types.js'

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

/** Channels kept owned after the pool was last read, like the old hour-long cache. */
const POOL_HOLD_MS = 60 * 60 * 1000

let pool: ReturnType<typeof createPool> | undefined

/**
 * The quality pool as a channels query: active channels with artwork and at least ten
 * tracks, the 200 most recently updated. The collection owns these rows, so channel
 * pages opened from home find them, and they stay owned for an hour after the last read.
 */
function createPool() {
	return createLiveQueryCollection({
		gcTime: POOL_HOLD_MS,
		query: (q) =>
			q
				.from({ch: channelsCollection})
				.where(({ch}) => gte(ch.track_count, 10))
				.where(({ch}) => not(isNull(ch.image)))
				// Lexical, like the server: the default locale order would also load the whole set
				.orderBy(({ch}) => ch.latest_track_at, {
					direction: 'desc',
					nulls: 'last',
					stringSort: 'lexical'
				})
				.orderBy(({ch}) => ch.id, {direction: 'asc', stringSort: 'lexical'})
				.limit(200)
	})
}

/** The quality channel pool, newest activity first, limited to channels active in `days`. */
export async function getFeaturedPool(days = 30): Promise<Channel[]> {
	const since = daysAgoIso(days)
	try {
		pool ??= createPool()
		const rows = (await pool.toArrayWhenReady()) as Channel[]
		return rows.filter((ch) => ch.latest_track_at && ch.latest_track_at >= since)
	} catch (e) {
		console.warn('[featured] failed to load channel pool', e)
		// The next read starts over instead of waiting on a failed load
		void pool?.cleanup()
		pool = undefined
		return []
	}
}
