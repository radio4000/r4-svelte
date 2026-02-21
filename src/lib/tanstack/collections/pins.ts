import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {uuid} from '$lib/utils'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import {logger} from '$lib/logger'

const log = logger.ns('pins').seal()

export interface Pin {
	id: string
	view_id: string
	position: number
}

export const pinsCollection = createCollection<Pin, string>(
	localStorageCollectionOptions({
		storageKey: LOCAL_STORAGE_KEYS.pins,
		getKey: (item) => item.id
	})
)

export function createPin(viewId: string): Pin {
	const existing = [...pinsCollection.state.values()]
	const maxPos = existing.reduce((max, p) => Math.max(max, p.position), -1)
	const entry: Pin = {
		id: uuid(),
		view_id: viewId,
		position: maxPos + 1
	}
	pinsCollection.insert(entry)
	log.info('Created pin', {id: entry.id, view_id: viewId})
	return entry
}

export function deletePin(id: string) {
	pinsCollection.delete(id)
	log.info('Deleted pin', {id})
}

export function deletePinsByViewId(viewId: string) {
	const toDelete = [...pinsCollection.state.values()].filter((p) => p.view_id === viewId)
	for (const p of toDelete) {
		pinsCollection.delete(p.id)
	}
	if (toDelete.length) log.info('Cascade-deleted pins for view', {viewId, count: toDelete.length})
}

export function reorderPins(orderedIds: string[]) {
	for (let i = 0; i < orderedIds.length; i++) {
		pinsCollection.update(orderedIds[i], (draft) => {
			draft.position = i
		})
	}
	log.info('Reordered pins', {count: orderedIds.length})
}
