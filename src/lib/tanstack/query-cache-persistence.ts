/** TanStack Query cache persistence to IndexedDB. */
import {
	persistQueryClientRestore,
	persistQueryClientSubscribe,
	type PersistedClient
} from '@tanstack/query-persist-client-core'
import {get, set, del, createStore} from 'idb-keyval'
import {queryClient} from './collections'
import {IDB_DATABASES, IDB_KEYS} from '$lib/storage-keys'
import {logger} from '$lib/logger'

const log = logger.ns('cache').seal()

let store = createStore(IDB_DATABASES.keyval, 'keyval')

/** Delete and recreate the IDB database if it's in a bad state. */
async function resetStore(reason: string) {
	log.warn('reset IDB store', {reason})
	await new Promise<void>((resolve, reject) => {
		const req = indexedDB.deleteDatabase(IDB_DATABASES.keyval)
		req.onsuccess = () => resolve()
		req.onerror = () => reject(req.error)
	})
	store = createStore(IDB_DATABASES.keyval, 'keyval')
}

/** Strip functions and circular refs so IDB's structured clone succeeds. */
function cleanForIDB(client: PersistedClient): PersistedClient {
	const ancestors: object[] = []
	return JSON.parse(
		JSON.stringify(client, function (_key, value) {
			if (typeof value === 'function') return undefined
			if (value && typeof value === 'object') {
				while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
				if (ancestors.includes(value)) return undefined
				ancestors.push(value)
			}
			return value
		})
	)
}

const idbPersister = {
	persistClient: async (client: PersistedClient) => {
		const clean = cleanForIDB(client)
		try {
			await set(IDB_KEYS.queryCache, clean, store)
		} catch (err) {
			await resetStore(`persistClient: ${err}`)
			await set(IDB_KEYS.queryCache, clean, store)
		}
	},
	restoreClient: async () => {
		try {
			return await get<PersistedClient>(IDB_KEYS.queryCache, store)
		} catch (err) {
			await resetStore(`restoreClient: ${err}`)
			return undefined
		}
	},
	removeClient: async () => {
		try {
			await del(IDB_KEYS.queryCache, store)
		} catch (err) {
			await resetStore(`removeClient: ${err}`)
		}
	}
}

/* Decides which "query keys" to persist locally */
function shouldDehydrateQuery(query: {queryKey: readonly unknown[]; state: {status: string; data: unknown}}): boolean {
	// Skip failed results
	if (query.state.status !== 'success') return false

	const key = query.queryKey?.[0]
	if (key === 'todos-cached') return false
	if (key === 'channels') return false
	if (key === 'broadcasts') return false
	if (key === 'tracks-freshness') return false
	// if (key === 'tracks') return false

	return true
}

const persistOptions = {
	queryClient,
	persister: idbPersister,
	maxAge: 24 * 60 * 60 * 1000,
	buster: '6',
	dehydrateOptions: {shouldDehydrateQuery}
}

export const cacheReady = persistQueryClientRestore(persistOptions)

cacheReady.then(() => {
	persistQueryClientSubscribe(persistOptions)
})
