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

const POOL_HOLD_MS = 60 * 60 * 1000

let pool: ReturnType<typeof createPool> | undefined
let poolDay: string | undefined

/**
 * No order or limit on purpose: an ordered window refetches whenever another page
 * unloads channels it had counted.
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

export async function getFeaturedPool(days = 30): Promise<Channel[]> {
	const since = daysAgoIso(days)
	const sinceDay = since.slice(0, 10)
	try {
		if (!pool || poolDay !== sinceDay) {
			void pool?.cleanup()
			pool = createPool(sinceDay)
			poolDay = sinceDay
		}
		const rows = (await pool.toArrayWhenReady()) as Channel[]
		return rows
			.filter((ch) => ch.latest_track_at && ch.latest_track_at >= since)
			.toSorted((a, b) =>
				a.latest_track_at! < b.latest_track_at!
					? 1
					: a.latest_track_at! > b.latest_track_at!
						? -1
						: 0
			)
	} catch (e) {
		console.warn('[featured] failed to load channel pool', e)
		void pool?.cleanup()
		pool = undefined
		return []
	}
}
