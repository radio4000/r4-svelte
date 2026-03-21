/**
 * Pure queue operations. No state mutation.
 * All functions return new arrays/values without side effects.
 */

import {shuffleArray} from '$lib/utils'

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

/** Remove ID from queue */
export function queueRemove(queue: string[], id: string): string[] {
	return queue.filter((i) => i !== id)
}

/** Shuffle but keep current track at front */
export function queueShuffleKeepCurrent(queue: string[], currentId: string): string[] {
	const rest = queue.filter((id) => id !== currentId)
	return [currentId, ...shuffleArray(rest)]
}

/** Rotate queue: move items before current to end (radio behavior) */
export function queueRotate(queue: string[], currentId: string): string[] {
	const idx = queue.indexOf(currentId)
	if (idx <= 0) return [...queue]
	return [...queue.slice(idx), ...queue.slice(0, idx)]
}

/** Deduplicate queue (keep first occurrence) */
export function queueUnique(queue: string[]): string[] {
	return [...new Set(queue)]
}

/** Get the active queue array for a deck (respects shuffle) */
export function getActiveQueue(
	deck:
		| {shuffle?: boolean; playlist_tracks?: string[]; playlist_tracks_shuffled?: string[]}
		| undefined
): string[] {
	if (!deck) return []
	return deck.shuffle ? deck.playlist_tracks_shuffled || [] : deck.playlist_tracks || []
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
