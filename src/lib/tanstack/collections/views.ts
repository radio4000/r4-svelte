import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {uuid} from '$lib/utils'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import {serializeView, type View} from '$lib/views.svelte'
import {deletePinsByViewId} from './pins'
import {logger} from '$lib/logger'

const log = logger.ns('views').seal()

export interface SavedView {
	id: string
	name: string
	description?: string
	params: string // serializeView(view).toString()
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
		params: serializeView(view).toString(),
		created_at: new Date().toISOString(),
		...(description ? {description} : {})
	}
	viewsCollection.insert(entry)
	log.info('Created view', {id: entry.id, name})
	return entry
}

export function updateView(id: string, updates: Partial<Pick<SavedView, 'name' | 'description' | 'params'>>) {
	viewsCollection.update(id, (draft) => {
		if (updates.name !== undefined) draft.name = updates.name
		if (updates.description !== undefined) draft.description = updates.description
		if (updates.params !== undefined) draft.params = updates.params
	})
	log.info('Updated view', {id, updates})
}

export function deleteView(id: string) {
	deletePinsByViewId(id)
	viewsCollection.delete(id)
	log.info('Deleted view', {id})
}
