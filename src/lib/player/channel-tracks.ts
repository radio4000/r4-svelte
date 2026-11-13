import {eq, queryOnce} from '@tanstack/db'
import {tracksCollection} from '#lib/collections/tracks.js'
import type {Track} from '#lib/types.js'

/** The loaded tracks of one channel, scanned from the local tracks collection (unordered). */
export function channelTracks(slug: string | undefined): Track[] {
	return [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
}

/**
 * How long a channel stays resident after `loadChannelTracks` returns. Long enough for the
 * caller to queue it and for the deck's keepalive pin (tracks-keepalive.svelte), which
 * Svelte mounts or re-keys on its next flush, to take over the rows.
 */
const HANDOFF_MS = 5000

/**
 * All of a channel's tracks, newest first, for player code outside components.
 *
 * One-shot through the collection's own query, on the `['tracks', slug]` key the channel
 * page and the deck pin use, so a channel already open or cached downloads nothing.
 *
 * queryOnce releases its rows when it finishes; anything that then reads the collection
 * (`tracksCollection.get(id)`, the deck display) would find them gone. So a lease on the
 * same key holds them for HANDOFF_MS. Same key on purpose: one refcounted owner, never
 * two overlapping subsets with different lifetimes (upstream-release-race.test.ts).
 */
export async function loadChannelTracks(slug: string): Promise<Track[]> {
	const lease = tracksCollection.subscribeChanges(() => {}, {
		where: (t) => eq(t.slug, slug),
		includeInitialState: true
	})
	try {
		return await queryOnce({
			query: (q) =>
				q
					.from({t: tracksCollection})
					.where(({t}) => eq(t.slug, slug))
					.orderBy(({t}) => t.created_at, 'desc')
		})
	} finally {
		setTimeout(() => lease.unsubscribe(), HANDOFF_MS)
	}
}
