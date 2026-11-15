import {eq, queryOnce} from '@tanstack/db'
import {tracksCollection} from '#lib/collections/tracks.js'
import type {Track} from '#lib/types.js'

/** Unordered. */
export function channelTracks(slug: string | undefined): Track[] {
	return [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
}

const pinned = new Map<string, number>()
const waiting = new Map<string, Set<() => void>>()

/**
 * Hands a lease over to a pin on the same key. Needed because a subscription's `status`
 * stays 'ready' while its subset loads, so it can't say when the pin has its rows.
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

const LEASE_CEILING_MS = 30_000

type Where = NonNullable<Parameters<typeof tracksCollection.subscribeChanges>[1]>['where']

/**
 * queryOnce releases its rows when it finishes; the lease keeps them until a pin takes over.
 * Same key on purpose: TanStack drops rows when two overlapping subsets release out of order.
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
