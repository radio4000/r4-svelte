/**
 * What to pin so a deck's queue survives on-demand collection GC.
 * Workaround for TanStack DB evaluating `inArray` as a full list scan per row —
 * see tracks-keepalive.svelte and docs/tanstack.md.
 */
import type {Deck} from '#lib/types.js'

/** Above this many channels a queue is a view (search, tags) rather than a channel,
 *  and pinning whole channels would load far more than the queue needs. */
const MAX_PINNED_CHANNELS = 4

/**
 * Channels first: few, cover the same rows, cheap to filter on, and stable while
 * the deck plays them. `ids` is the fallback for rows no channel pin can reach:
 * ephemeral Discogs tracks, queues spread over too many channels, and queues whose
 * channels we can't yet name — all short, or rare, or both.
 *
 * A queue's channels are only trusted when the deck's view names them, or when every
 * row is loaded and can say which channel it belongs to. Guessing from a half-loaded
 * queue would shrink the pin, evict the rest, and shrink it again.
 *
 * Pass a snapshot read as getTrack (`collection.get`), deliberately non-reactive to
 * row loads: a half-loaded queue stays on the id pin until the deck next churns.
 * Over-pins, never under-pins — don't "fix" it into a live query.
 */
export function queuePinTargets(
	deck: Pick<Deck, 'playlist_tracks' | 'playlist_slug' | 'view'> | undefined,
	getTrack: (id: string) => {slug?: string | null} | undefined
): {slugs: string[]; ids: string[]} {
	if (!deck) return {slugs: [], ids: []}
	const tracks = deck.playlist_tracks ?? []
	const viewSlugs = new Set<string>()
	for (const source of deck.view?.sources ?? []) {
		for (const channel of source?.channels ?? []) viewSlugs.add(channel)
	}
	// The view declares where the queue comes from — the one channel list that stays
	// true no matter what is loaded.
	if (viewSlugs.size && viewSlugs.size <= MAX_PINNED_CHANNELS) {
		const ids = tracks.filter((id) => {
			const track = getTrack(id)
			return track && !track.slug
		})
		return {slugs: [...viewSlugs].toSorted(), ids}
	}

	// No usable view (a track click rebuilds the queue and drops it): fall back to what the
	// rows themselves say, but only while every one of them is there to say it.
	const slugs = new Set<string>()
	if (deck.playlist_slug) slugs.add(deck.playlist_slug)
	const ids: string[] = []
	let unresolved = 0
	for (const id of tracks) {
		const track = getTrack(id)
		if (!track) unresolved++
		else if (track.slug) slugs.add(track.slug)
		else ids.push(id)
	}
	if (unresolved || !slugs.size || slugs.size > MAX_PINNED_CHANNELS) {
		return {slugs: [], ids: [...tracks]}
	}
	return {slugs: [...slugs].toSorted(), ids}
}
