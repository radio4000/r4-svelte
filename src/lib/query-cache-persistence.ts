/** TanStack Query cache persistence to IndexedDB. */
import {
	persistQueryClientRestore,
	persistQueryClientSubscribe,
	type PersistedClient
} from '@tanstack/query-persist-client-core'
import {get, set, del, createStore} from 'idb-keyval'
import {browser} from '$app/environment'
import {queryClient} from './collections/query-client'
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

let persistCount = 0
let pendingClient: PersistedClient | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500

/** Flush the latest pending client to IDB. */
async function flushToIDB() {
	const client = pendingClient
	if (!client) return
	pendingClient = null

	const n = ++persistCount
	const t0 = performance.now()
	const clean = cleanForIDB(client)
	const cleanMs = (performance.now() - t0).toFixed(1)
	const queries = client.clientState?.queries?.length ?? '?'
	const sizeKB = (JSON.stringify(clean).length / 1024).toFixed(0)
	try {
		await set(IDB_KEYS.queryCache, clean, store)
		const totalMs = (performance.now() - t0).toFixed(1)
		log.debug(`persistClient #${n}`, {queries, sizeKB: `${sizeKB}KB`, cleanMs: `${cleanMs}ms`, totalMs: `${totalMs}ms`})
	} catch (err) {
		await resetStore(`persistClient: ${err}`)
		await set(IDB_KEYS.queryCache, clean, store)
		const totalMs = (performance.now() - t0).toFixed(1)
		log.warn(`persistClient #${n} (retry)`, {queries, sizeKB: `${sizeKB}KB`, totalMs: `${totalMs}ms`})
	}
}

// Flush pending data on page close so debounced writes aren't lost
if (browser) {
	window.addEventListener('beforeunload', () => {
		if (pendingClient) {
			if (debounceTimer) clearTimeout(debounceTimer)
			flushToIDB()
		}
	})
}

const idbPersister = {
	persistClient: async (client: PersistedClient) => {
		pendingClient = client
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(flushToIDB, DEBOUNCE_MS)
	},
	restoreClient: async () => {
		const t0 = performance.now()
		try {
			const result = await get<PersistedClient>(IDB_KEYS.queryCache, store)
			const ms = (performance.now() - t0).toFixed(1)
			const queries = result?.clientState?.queries?.length ?? 0
			log.debug('restoreClient', {queries, ms: `${ms}ms`})
			return result
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

	const queryKey = query.queryKey ?? []
	const key = queryKey[0]
	// Shuffled channel queries are random — restoring stale order is misleading
	if (key === 'channels' && queryKey.includes('shuffle')) return false
	// Broadcast state is ephemeral (realtime), stale data causes ghost sessions
	if (key === 'broadcasts') return false
	// Freshness checks must always hit the server
	if (key === 'tracks-freshness') return false
	// Keep query-cache persistence focused on small canonical snapshots.
	// Broad, derived, or partial query shapes duplicate large datasets and are cheaper to recompute.
	if (key === 'channels') return queryKey.length === 2 && typeof queryKey[1] === 'string'
	if (key === 'tracks') return queryKey.length === 2 && typeof queryKey[1] === 'string'

	return true
}

const persistOptions = {
	queryClient,
	persister: idbPersister,
	maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days — matches gcTime, keeps user import data alive
	buster: '9',
	dehydrateOptions: {shouldDehydrateQuery}
}

export const cacheReady = persistQueryClientRestore(persistOptions)

cacheReady.then(() => {
	persistQueryClientSubscribe(persistOptions)
})
