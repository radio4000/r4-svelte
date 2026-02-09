import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {logger} from '$lib/logger'
import {uuid} from '$lib/utils'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

const log = logger.ns('history').seal()

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
		storageKey: LOCAL_STORAGE_KEYS.playHistory,
		getKey: (item) => item.id
	})
)

export function addPlayHistoryEntry(
	track: {id: string; slug?: string | null; title: string; url: string},
	opts: {reason_start?: string; shuffle?: boolean}
) {
	if (!track.slug) return
	try {
		playHistoryCollection.insert({
			id: uuid(),
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
	} catch (error) {
		log.error('Failed to add play history entry', {track: track.id, error})
	}
}

export function endPlayHistoryEntry(
	trackId: string,
	opts: {ms_played: number; reason_end?: string; skipped?: boolean}
) {
	try {
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
	} catch (error) {
		log.error('Failed to end play history entry', {track: trackId, error})
	}
}

export function clearPlayHistory() {
	try {
		const ids = [...playHistoryCollection.state.keys()]
		if (!ids.length) return
		playHistoryCollection.delete(ids)
		log.info('Play history cleared')
	} catch (error) {
		log.error('Failed to clear play history', {error})
	}
}
