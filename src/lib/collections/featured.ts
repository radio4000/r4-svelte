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

const pools = new Map<string, ReturnType<typeof createPool>>()

/**
 * The quality pool as a channels query: channels with artwork and at least ten tracks,
 * active since `sinceDay`. The collection owns these rows, so channel pages opened from
 * home find them, and they stay owned for an hour after the last read. No order or limit
 * on purpose: an ordered window refills itself from the server, refetching, whenever
 * another page unloads channels it had counted, which was every explore and search step.
 */
function createPool(sinceDay: string) {
	return createLiveQueryCollection({
		gcTime: POOL_HOLD_MS,
		query: (q) =>
			q
				.from({ch: channelsCollection})
				.where(({ch}) => gte(ch.track_count, 10))
				.where(({ch}) => not(isNull(ch.image)))
				.where(({ch}) => gte(ch.latest_track_at, sinceDay))
	})
}

/** The quality channel pool, channels with artwork and ten tracks active in the last `days`. */
export async function getFeaturedPool(days = 30): Promise<Channel[]> {
	const since = daysAgoIso(days)
	// Whole days, so the request stays the same all day and the rows are reused
	const sinceDay = since.slice(0, 10)
	let pool = pools.get(sinceDay)
	try {
		if (!pool) {
			// A new day replaces yesterday's pool
			for (const old of pools.values()) void old.cleanup()
			pools.clear()
			pool = createPool(sinceDay)
			pools.set(sinceDay, pool)
		}
		const rows = (await pool.toArrayWhenReady()) as Channel[]
		return rows
			.filter((ch) => ch.latest_track_at && ch.latest_track_at >= since)
			// Newest activity first, as the server ordered it
			.toSorted((a, b) => (a.latest_track_at! < b.latest_track_at! ? 1 : a.latest_track_at! > b.latest_track_at! ? -1 : 0))
	} catch (e) {
		console.warn('[featured] failed to load channel pool', e)
		// The next read starts over instead of waiting on a failed load
		void pool?.cleanup()
		pools.delete(sinceDay)
		return []
	}
}
