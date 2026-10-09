/**
 * Reset track titles to their YouTube video titles, with an undo that survives reloads.
 * Custom titles are hand-written, so the previous titles are kept per channel in
 * localStorage until undone. Repeat resets merge into the same undo.
 */
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import type {TrackWithMeta} from '$lib/types'

export type TitleChange = {id: string; title: string; previous: string}

/** Tracks whose cached YouTube title differs from their own, with the title to restore. */
export function titleResets(tracks: TrackWithMeta[]): TitleChange[] {
	const changes: TitleChange[] = []
	for (const track of tracks) {
		const raw = track.youtube_data?.title
		const title = typeof raw === 'string' ? raw.trim() : ''
		if (!title || title === track.title) continue
		changes.push({id: track.id, title, previous: track.title})
	}
	return changes
}

/**
 * Fold a new reset into the stored undo. A track reset twice keeps its original title,
 * unless it was hand-edited in between, in which case that edit is what undo brings back.
 */
export function mergeTitleUndo(existing: TitleChange[], changes: TitleChange[]): TitleChange[] {
	const byId = new Map(existing.map((c) => [c.id, c]))
	for (const change of changes) {
		const prior = byId.get(change.id)
		const previous = prior && prior.title === change.previous ? prior.previous : change.previous
		if (previous === change.title) byId.delete(change.id)
		else byId.set(change.id, {...change, previous})
	}
	return [...byId.values()]
}

/** Changes that are safe to undo: the track still exists and still has the reset title. */
export function undoableTitles(
	changes: TitleChange[],
	currentTitle: (id: string) => string | undefined
) {
	return changes.filter((c) => currentTitle(c.id) === c.title)
}

function readAll(): Record<string, TitleChange[]> {
	try {
		return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.titleResetUndo) || '{}')
	} catch {
		return {}
	}
}

export function loadTitleUndo(slug: string): TitleChange[] {
	return readAll()[slug] ?? []
}

export function saveTitleUndo(slug: string, changes: TitleChange[]) {
	const all = readAll()
	if (changes.length) all[slug] = changes
	else delete all[slug]
	localStorage.setItem(LOCAL_STORAGE_KEYS.titleResetUndo, JSON.stringify(all))
}
