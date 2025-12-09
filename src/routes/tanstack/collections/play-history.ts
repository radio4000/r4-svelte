import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'

// Play history collection - local-only, persists to localStorage
export interface PlayHistoryEntry {
	id: string
	track_id: string
	slug: string
	title: string
	url: string
	started_at: string
	ended_at?: string
	ms_played: number
	reason_start?: string
	reason_end?: string
	shuffle: boolean
	skipped: boolean
}

export const playHistoryCollection = createCollection<PlayHistoryEntry, string>(
	localStorageCollectionOptions({
		storageKey: 'r5-play-history',
		getKey: (item) => item.id
	})
)

export function addPlayHistoryEntry(
	track: {id: string; slug?: string | null; title: string; url: string},
	opts: {reason_start?: string; shuffle?: boolean}
) {
	if (!track.slug) return
	playHistoryCollection.insert({
		id: crypto.randomUUID(),
		track_id: track.id,
		slug: track.slug,
		title: track.title,
		url: track.url,
		started_at: new Date().toISOString(),
		ms_played: 0,
		reason_start: opts.reason_start,
		shuffle: opts.shuffle ?? false,
		skipped: false
	})
}

export function endPlayHistoryEntry(
	trackId: string,
	opts: {ms_played: number; reason_end?: string; skipped?: boolean}
) {
	const entries = [...playHistoryCollection.state.values()]
	// Find most recent open entry for this track (handles repeat plays)
	const entry = entries
		.filter((e) => e.track_id === trackId && !e.ended_at)
		.sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
	if (!entry) return

	playHistoryCollection.update(entry.id, (draft) => {
		draft.ended_at = new Date().toISOString()
		draft.ms_played = opts.ms_played
		draft.reason_end = opts.reason_end
		draft.skipped = opts.skipped ?? false
	})
}

export function clearPlayHistory() {
	for (const id of playHistoryCollection.state.keys()) {
		playHistoryCollection.delete(id)
	}
}
