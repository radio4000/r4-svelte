import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions, type LocalStorageCollectionConfig} from '@tanstack/db'

// Ideally SDK errors would have consistent shape. They don't.
export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message
	if (typeof err === 'string') return err
	if (err && typeof err === 'object' && 'message' in err) return String(err.message)
	return 'Unknown error'
}

/**
 * Create a local-only collection persisted to localStorage and synced across tabs.
 * Shared setup for collections/utils that never touch the server (captureEventsCollection,
 * spamDecisionsCollection, trackMetaCollection, viewsCollection).
 */
export function createLocalCollection<T extends object, TKey extends string | number = string>(
	config: LocalStorageCollectionConfig<T, never, TKey> & {schema?: never}
) {
	return createCollection(localStorageCollectionOptions(config))
}
