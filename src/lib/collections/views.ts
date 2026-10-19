import {uuid} from '#lib/utils.js'
import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'
import {serializeView, type View, type ViewURI} from '#lib/views.js'
import {logger} from '#lib/logger.js'
import {createLocalCollection} from './utils'

const log = logger.ns('views').seal()

export interface SavedView {
	id: string
	name: string
	description?: string
	uri: ViewURI
	position?: number // non-null = pinned, value = sort order
	created_at: string
}

/** Local-only saved views (search/filter combos), optionally pinned to the nav. */
export const viewsCollection = createLocalCollection<SavedView, string>({
	storageKey: LOCAL_STORAGE_KEYS.views,
	getKey: (item) => item.id
})

/** Save a new view under `name`, serializing it to a shareable URI. */
export function createView(name: string, view: View, description?: string): SavedView {
	const entry: SavedView = {
		id: uuid(),
		name,
		uri: serializeView(view),
		created_at: new Date().toISOString(),
		...(description ? {description} : {})
	}
	viewsCollection.insert(entry)
	log.info('Created view', {id: entry.id, name})
	return entry
}

/** Patch a saved view's fields (only keys present in `updates` are changed). */
export function updateView(
	id: string,
	updates: Partial<Pick<SavedView, 'name' | 'description' | 'uri' | 'position'>>
) {
	viewsCollection.update(id, (draft) => {
		if (updates.name !== undefined) draft.name = updates.name
		if (updates.description !== undefined) draft.description = updates.description
		if (updates.uri !== undefined) draft.uri = updates.uri
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
