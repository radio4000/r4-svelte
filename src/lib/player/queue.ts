/**
 * Pure queue operations. No state mutation.
 * All functions return new arrays/values without side effects.
 */
import type {Deck} from '$lib/types'

/** Returns the next track ID in queue, or null if at end */
export function queueNext(queue: string[], currentId: string): string | null {
	const idx = queue.indexOf(currentId)
	if (idx === -1) return null
	return queue[idx + 1] ?? null
}

/** Returns the previous track ID in queue, or null if at start */
export function queuePrev(queue: string[], currentId: string): string | null {
	const idx = queue.indexOf(currentId)
	if (idx <= 0) return null
	return queue[idx - 1]
}

/** Insert multiple IDs after current position */
export function queueInsertManyAfter(
	queue: string[],
	currentId: string,
	insertIds: string[]
): string[] {
	const idx = queue.indexOf(currentId)
	if (idx === -1) return [...queue, ...insertIds]
	return [...queue.slice(0, idx + 1), ...insertIds, ...queue.slice(idx + 1)]
}

/** Get the active playback queue, respecting shuffle and an optional results subset. */
export function getActiveQueue(
	deck:
		| Pick<
				Deck,
				'shuffle' | 'playlist_tracks' | 'playlist_tracks_shuffled' | 'playlist_tracks_filtered'
		  >
		| undefined
): string[] {
	if (!deck) return []
	const queue = deck.shuffle ? deck.playlist_tracks_shuffled || [] : deck.playlist_tracks || []
	if (!deck.playlist_tracks_filtered) return queue
	const matching = new Set(deck.playlist_tracks_filtered)
	return queue.filter((id) => matching.has(id))
}

/** Can the deck play from its queue? */
export function canPlay(queue: string[], trackId: string | undefined): boolean {
	return Boolean(queue.length && trackId && queue.includes(trackId))
}

/** Can we go to the previous track? */
export function canPrev(queue: string[], trackId: string | undefined): boolean {
	return Boolean(trackId && queuePrev(queue, trackId))
}

/** Can we go to the next track? */
export function canNext(queue: string[], trackId: string | undefined): boolean {
	return Boolean(queue.length > 1 && trackId && queue.includes(trackId))
}
