import {eq, queryOnce} from '@tanstack/db'
import {tracksCollection} from '#lib/collections/tracks.js'
import type {Track} from '#lib/types.js'

/** The loaded tracks of one channel, scanned from the local tracks collection (unordered). */
export function channelTracks(slug: string | undefined): Track[] {
	return [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
}

/** Subsets a deck keepalive pin owns on a door's own key (`slug:x` or `id:x`), per pin. */
const pinned = new Map<string, number>()
/** Leases waiting for such a pin, by the same key. */
const waiting = new Map<string, Set<() => void>>()

/**
 * The deck keepalive (tracks-keepalive.svelte) calls this when it pins one channel or one
 * track, and the returned function when the pin goes. Such a pin is on the door's own
 * query key, so it owns the rows from the moment it subscribes, and a door lease on the
 * same channel or track hands over then. Pins on several channels or tracks have keys of
 * their own and don't call this. (A subscription's `status` stays 'ready' while its subset
 * loads, so it can't tell us when such a pin has its rows.)
 */
export function holdPin(pin: {slug: string} | {id: string}): () => void {
	const key = 'slug' in pin ? `slug:${pin.slug}` : `id:${pin.id}`
	pinned.set(key, (pinned.get(key) ?? 0) + 1)
	for (const release of waiting.get(key) ?? []) release()
	return () => {
		const n = (pinned.get(key) ?? 1) - 1
		if (n > 0) pinned.set(key, n)
		else pinned.delete(key)
	}
}

/**
 * Ceiling on a lease no pin takes over: a load that ends in no deck (no tracks, a page
 * that only reads the rows), or in a queue pinned by several channels or ids. Then the
 * rows go back to on-demand GC.
 */
const LEASE_CEILING_MS = 30_000

type Where = NonNullable<Parameters<typeof tracksCollection.subscribeChanges>[1]>['where']

/**
 * Run a one-shot query while a lease on the same subset holds its rows, then keep the
 * lease until a deck pin on that subset takes over (`holdPin`) or LEASE_CEILING_MS.
 * queryOnce alone releases its rows when it finishes, so anything that then reads the
 * collection (`tracksCollection.get(id)`, the deck display) would find them gone. Same
 * key on purpose: one refcounted owner, never two overlapping subsets with different
 * lifetimes (upstream-release-race.test.ts).
 */
async function leased<T>(key: string, where: Where, query: () => Promise<T>): Promise<T> {
	const lease = tracksCollection.subscribeChanges(() => {}, {where, includeInitialState: true})
	let ceiling: ReturnType<typeof setTimeout> | undefined
	const release = () => {
		clearTimeout(ceiling)
		waiting.get(key)?.delete(release)
		if (!waiting.get(key)?.size) waiting.delete(key)
		lease.unsubscribe()
	}
	let result: T
	try {
		result = await query()
	} catch (error) {
		release()
		throw error
	}
	if (pinned.has(key)) release()
	else {
		waiting.set(key, (waiting.get(key) ?? new Set()).add(release))
		ceiling = setTimeout(release, LEASE_CEILING_MS)
	}
	return result
}

/**
 * All of a channel's tracks, newest first, for player code outside components. Goes
 * through the collection's own query on `['tracks', slug]`, the key the channel page and
 * the deck pin use, so a channel already open or cached downloads nothing.
 */
export function loadChannelTracks(slug: string): Promise<Track[]> {
	return leased(
		`slug:${slug}`,
		(t) => eq(t.slug, slug),
		() =>
			queryOnce({
				query: (q) =>
					q
						.from({t: tracksCollection})
						.where(({t}) => eq(t.slug, slug))
						.orderBy(({t}) => t.created_at, 'desc')
			})
	)
}

/**
 * One track by id, for player code outside components; undefined if it doesn't exist.
 * Goes through the collection's own query on `['tracks', 'ids', id]`, the key of a deck's
 * current-track pin, so a track already loaded costs no request.
 */
export function loadTrack(id: string): Promise<Track | undefined> {
	return leased(
		`id:${id}`,
		(t) => eq(t.id, id),
		() =>
			queryOnce({
				query: (q) =>
					q
						.from({t: tracksCollection})
						.where(({t}) => eq(t.id, id))
						.findOne()
			})
	)
}
