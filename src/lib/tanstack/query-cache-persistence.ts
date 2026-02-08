/** TanStack Query cache persistence to IndexedDB. */
import {
	persistQueryClientRestore,
	persistQueryClientSubscribe,
	type PersistedClient
} from '@tanstack/query-persist-client-core'
import {get, set, del, createStore} from 'idb-keyval'
import {queryClient} from './collections'
import {IDB_DATABASES, IDB_KEYS} from '$lib/storage-keys'

const store = createStore(IDB_DATABASES.keyval, 'keyval')

function serialize(client: PersistedClient): string {
	const seen = new WeakSet()
	return JSON.stringify(client, (_key, value) => {
		if (typeof value === 'function') return undefined
		if (value && typeof value === 'object') {
			if (seen.has(value)) return undefined
			seen.add(value)
		}
		return value
	})
}

const idbPersister = {
	persistClient: async (client: PersistedClient) => {
		await set(IDB_KEYS.queryCache, serialize(client), store)
	},
	restoreClient: async () => {
		const data = await get<string>(IDB_KEYS.queryCache, store)
		return data ? JSON.parse(data) : undefined
	},
	removeClient: async () => {
		await del(IDB_KEYS.queryCache, store)
	}
}

/* Decides which "query keys" to persist locally */
function shouldDehydrateQuery(query: {queryKey: readonly unknown[]; state: {status: string; data: unknown}}): boolean {
	// Skip failed results
	if (query.state.status !== 'success') return false

	const key = query.queryKey?.[0]
	if (key === 'todos-cached') return false
	if (key === 'channels') return false
	// if (key === 'tracks') return false

	return true
}

const persistOptions = {
	queryClient,
	persister: idbPersister,
	maxAge: 24 * 60 * 60 * 1000,
	buster: '5',
	dehydrateOptions: {shouldDehydrateQuery}
}

export const cacheReady = persistQueryClientRestore(persistOptions)

cacheReady.then(() => {
	persistQueryClientSubscribe(persistOptions)
})
