import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {uuid} from '$lib/utils'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import {serializeView, type View} from '$lib/views'
import {logger} from '$lib/logger'

const log = logger.ns('views').seal()

export interface SavedView {
	id: string
	name: string
	description?: string
	params: string // serializeView(view)
	position?: number // non-null = pinned, value = sort order
	created_at: string
}

export const viewsCollection = createCollection<SavedView, string>(
	localStorageCollectionOptions({
		storageKey: LOCAL_STORAGE_KEYS.views,
		getKey: (item) => item.id
	})
)

export function createView(name: string, view: View, description?: string): SavedView {
	const entry: SavedView = {
		id: uuid(),
		name,
		params: serializeView(view),
		created_at: new Date().toISOString(),
		...(description ? {description} : {})
	}
	viewsCollection.insert(entry)
	log.info('Created view', {id: entry.id, name})
	return entry
}

export function updateView(
	id: string,
	updates: Partial<Pick<SavedView, 'name' | 'description' | 'params' | 'position'>>
) {
	viewsCollection.update(id, (draft) => {
		if (updates.name !== undefined) draft.name = updates.name
		if (updates.description !== undefined) draft.description = updates.description
		if (updates.params !== undefined) draft.params = updates.params
		if (updates.position !== undefined) draft.position = updates.position
	})
	log.info('Updated view', {id, updates})
}

export function deleteView(id: string) {
	viewsCollection.delete(id)
	log.info('Deleted view', {id})
}

/** Get all pinned views sorted by position. */
export function getPinnedViews(): SavedView[] {
	return [...viewsCollection.state.values()]
		.filter((v) => v.position != null)
		.toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/** Pin a view (appends to end). */
export function pinView(id: string) {
	const maxPos = [...viewsCollection.state.values()]
		.filter((v) => v.position != null)
		.reduce((max, v) => Math.max(max, v.position ?? 0), -1)
	updateView(id, {position: maxPos + 1})
	log.info('Pinned view', {id, position: maxPos + 1})
}

/** Unpin a view. */
export function unpinView(id: string) {
	viewsCollection.update(id, (draft) => {
		draft.position = undefined
	})
	log.info('Unpinned view', {id})
}

/** Reorder pinned views by ID list. */
export function reorderPinnedViews(orderedIds: string[]) {
	for (let i = 0; i < orderedIds.length; i++) {
		updateView(orderedIds[i], {position: i})
	}
	log.info('Reordered pinned views', {count: orderedIds.length})
}
