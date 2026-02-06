# TanStack Query + DB

Patterns for fetching data via network, mutating it and making sure it's up to date everywhere in the app.

## Query — caches responses

Smart cache in front of any async function. Key + function → data, loading/error states, deduplication.

**Cache rules:**

- **Deduplication** — same key in-flight? Share the promise. State-based, not time-based.
- **staleTime** — how long data is fresh. No refetch during this window.
- **gcTime** — how long unused data stays after last unsubscribe. Default 5min.
- **Stale-while-revalidate** — stale? Serve cache, refetch behind the scenes.

**Imperative** — plain JS, call anywhere, one-shot:

| Method                | Does                                               |
| --------------------- | -------------------------------------------------- |
| `fetchQuery()`        | Fetch → cache → return data                        |
| `prefetchQuery()`     | Fetch → cache → return nothing                     |
| `ensureQueryData()`   | Return cached or fetch                             |
| `getQueryData()`      | Read cache, no fetch                               |
| `setQueryData()`      | Write to cache, no fetch. Notifies subscribers     |
| `invalidateQueries()` | Mark stale, refetch if subscribed. Prefix matching |
| `removeQueries()`     | Delete from cache                                  |

**Declarative** — Svelte component, live subscription:

| Method          | Does                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `createQuery()` | Subscribe to key, fetch if needed, reactive (`data`, `status`, `error`) |

`initialData` = starting value before first fetch. `setQueryData()` = overwrite cache anytime.

**Internals:** QueryClient wraps QueryCache. Use QueryClient. QueryCache is the engine, QueryClient is the steering wheel.

**queryOptions()** — define key + fn + config once, reuse everywhere. Just returns the object. Convenience, not a concept.

```js
const channelOpts = (slug) =>
	queryOptions({
		queryKey: ['channel', slug],
		queryFn: () => sdk.readChannel(slug)
	})
// use with createQuery(), fetchQuery(), prefetchQuery(), etc.
```

**queryFn must throw on error.** No throw = Query thinks it succeeded.

Query keys are hierarchical — invalidate broadly (`['tracks']`) or precisely (`['tracks', 'starttv']`).

---

## DB — stores rows

Query caches **responses** (keyed by request). DB stores **entities** (keyed by ID, like a database table). Normalized = one source of truth per entity, no duplicates.

Two fetches returning the same track? Query has two cache entries with duplicated data. DB has one row.

DB adds:

- **Queryable in-memory store** with SQL-like syntax
- **Live queries** that re-render on data changes
- **Cross-collection queries** (query all tracks, not just per-slug)
- **Optimistic mutations** with automatic rollback

### Collections

A collection = a typed, in-memory table. Keyed by entity ID (e.g. `track.id`).

**How data gets in:** `queryCollectionOptions()` — same shape as `queryOptions()` (key + fn + config) but feeds fetched data into a collection as rows, instead of storing the raw response in QueryClient cache. DB uses Query under the hood for fetching.

- `queryOptions()` → response → **QueryClient cache**
- `queryCollectionOptions()` → response → **collection rows**

Pick one per data type. Don't use both for the same data.

### Collection types

Three factory functions, each wrapping `createCollection()` with different behavior:

| Type                              | Package                         | Data source             | Persistence                   | Use for                                            |
| --------------------------------- | ------------------------------- | ----------------------- | ----------------------------- | -------------------------------------------------- |
| `queryCollectionOptions()`        | `@tanstack/query-db-collection` | Network via QueryClient | Query cache (+ optional IDB)  | Server data: tracks, channels, follows             |
| `localStorageCollectionOptions()` | `@tanstack/db`                  | Local                   | localStorage (cross-tab sync) | Small local data: play history, metadata, settings |
| `localOnlyCollectionOptions()`    | `@tanstack/db`                  | Local                   | None (in-memory only)         | Ephemeral state, demos, tests                      |

**All types share the same collection API** — `collection.get(id)`, `.insert()`, `.update()`, `.delete()`, `collection.state` (Map), `collection.toArray` (Array), and `useLiveQuery`.

**Reading data — reactive vs one-off:**

- **Reactive:** `const query = useLiveQuery(q => q.from({t: collection}))` — subscribes to changes, re-renders on insert/update/delete. Read results from `query.data` (array).
- **One-off:** `collection.get(id)`, `collection.state` (Map), `collection.toArray` (Array) — plain snapshots, no subscription.

Don't confuse `query.data` (reactive result from `useLiveQuery`) with `collection.state` (raw Map, not reactive). `collection.state` and `.toArray` return a **new plain object every call**. Wrapping them in `$derived` does NOT make them reactive — Svelte can't track when the collection's internal data changes. `$derived([...collection.state.values()].filter(...))` only re-runs when other Svelte signals in the expression change (e.g. a route param), not when rows are inserted/updated/deleted. For reactive reads, use `useLiveQuery` and derive from `query.data`.

**`utils` differ by type:**

- **All types:** `utils.acceptMutations()` — apply external mutations
- **Query only:** `utils.writeInsert`, `writeUpsert`, `writeUpdate`, `writeDelete`, `writeBatch` (bypass handlers, write directly to collection + query cache), `utils.refetch()`, `utils.isFetching`, `utils.isLoading`, `utils.lastError`
- **localStorage only:** `utils.clearStorage()`, `utils.getStorageSize()`

For local/localStorage collections, use `collection.insert()`/`.update()`/`.delete()` directly — they go through mutation handlers which are auto-configured.

```
src/lib/tanstack/collections/
├── queryCollectionOptions:        channels, tracks, follows, broadcasts
├── localStorageCollectionOptions:  track-meta, play-history, spam-decisions
└── localOnlyCollectionOptions:     demo only
```

### Live queries vs createQuery

`createQuery` returns the response from **one query key** — exactly what that fetch returned, as a blob.

`useLiveQuery` queries across **all rows in the collection**, regardless of which fetch brought them in. It also reacts to local mutations (`collection.insert()`) and with `syncMode: 'on-demand'`, a `.where()` clause triggers the fetch — the live query is both reader and fetch trigger.

```js
const recentTracks = useLiveQuery((q) =>
	q
		.from({tracks: tracksCollection})
		.where(({tracks}) => eq(tracks.channel_id, channelId))
		.orderBy(({tracks}) => tracks.created_at, 'desc')
		.limit(50)
)
// Also: leftJoin, groupBy, having, distinct, findOne(), count(), sum(), avg()
```

`.limit()` or `.offset()` require `.orderBy()` — throws error without it.

### Data flow

```
Network → fetchQuery/createQuery → QueryClient cache (responses, keyed by request)
                                           ↓ queryCollectionOptions
                                     Collection (rows, keyed by ID)
                                           ↓ useLiveQuery
                                     Component (reactive, filtered, joined)
```

Query fetches. DB stores. Live queries read.

### R4 patterns

Three patterns we use, depending on the query type:

**Pattern 1: Standard** — `useLiveQuery` does everything (fetch + read).

```js
const tracks = useLiveQuery((q) => q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.slug, slug)))
// triggers fetch via on-demand sync, reads from collection, reactive
```

Use for: channel tracks by slug, channels by ID — anything d2ts operators can handle (`eq`, `gt`, `lt`, `like`).

**Pattern 2: Hybrid** — `useLiveQuery` triggers the fetch, `$derived` filters its result. For operators d2ts doesn't support (array `includes`, full-text search, `overlaps`).

```js
// query.data is reactive (re-renders on collection changes):
const query = useLiveQuery((q) =>
	q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.channel_id, channelId))
)
// Filter client-side from the reactive query.data, not from collection.state:
let jazzTracks = $derived((query.data ?? []).filter((t) => t.tags?.includes('jazz')))
```

Requires `writeUpsert` in the collection's `queryFn` so fetched data actually lands in the collection. Supabase does the real filtering server-side; the client just stores and reads the results.

**Warning:** `$derived([...collection.state.values()].filter(...))` is NOT reactive to collection changes — `collection.state` is a plain Map snapshot (see "Reading data" above). Always derive from `query.data` (useLiveQuery result), not from `collection.state`.

**Pattern 3: One-off** — just need data, don't need reactivity.

```js
const data = await queryClient.fetchQuery({
	queryKey: ['tracks', slug],
	queryFn: () => fetchTracksBySlug(slug)
})
```

Use for: freshness checks, prefetching, loaders.

### What touches what

| Method                            | Remote           | Query Cache | Collection         | Returns  |
| --------------------------------- | ---------------- | ----------- | ------------------ | -------- |
| `fetchQuery`                      | fetch            | write       | -                  | data     |
| `prefetchQuery`                   | fetch            | write       | -                  | void     |
| `useLiveQuery`                    | fetch (if stale) | read/write  | write              | reactive |
| `collection.get(id)`              | -                | -           | read               | item     |
| `[...collection.state.values()]`  | -                | -           | read               | array    |
| `collection.insert/update/delete` | -                | -           | write (optimistic) | -        |
| `collection.utils.writeUpsert`    | -                | write       | write              | -        |

**Key insight**: `fetchQuery`/`prefetchQuery` don't touch the collection. To get data into the collection, use `useLiveQuery` or `writeUpsert`.

---

## One-Off Queries

### From collection (if data already loaded)

Snapshots — not reactive. Fine for event handlers, loaders, one-time lookups.

```js
const track = tracksCollection.get(id)
const all = tracksCollection.toArray
const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === slug)
```

### From remote (one-time fetch)

```js
const data = await queryClient.fetchQuery({
	queryKey: ['tracks', slug],
	queryFn: () => fetchTracksBySlug(slug)
})
```

### Fetch + populate collection

```js
const data = await queryClient.fetchQuery({...})
tracksCollection.utils.writeBatch(() => {
  for (const track of data) {
    tracksCollection.utils.writeUpsert(track)
  }
})
```

---

## Mutations

### Online-only (simple)

```ts
const todoCollection = createCollection({
	onInsert: async ({transaction}) => {
		await api.create(transaction.mutations[0].modified)
		return {refetch: false}
	}
})
todoCollection.insert({id, text}) // fires onInsert
todoCollection.insert({id, text}, {optimistic: false}) // wait for server
```

### Offline-first (tracks, channels)

```ts
const tx = executor.createOfflineTransaction({mutationFnName: 'syncTracks'})
tx.mutate(() => tracksCollection.insert(newTrack))
await tx.commit()
```

1. Persist to IndexedDB outbox (durable)
2. Apply optimistic update to collection (instant UI)
3. Sync to server when online (via mutationFn)
4. Remove from outbox on success

Transaction states: `pending` → `persisting` → `completed` (or `failed`). Use `await tx.isPersisted.promise` to wait.

### Direct writes with manual sync (follows, spam decisions)

For simple toggles without offline support, use `utils.write*` directly:

```ts
export async function followChannel(channelId: string) {
	followsCollection.utils.writeInsert({id: channelId}) // optimistic
	const {error} = await sdk.channels.followChannel(userChannelId, channelId)
	if (error) followsCollection.utils.writeDelete(channelId) // rollback
}
```

Direct `collection.insert()`/`delete()` require handlers. `utils.write*` bypasses this.

### Our wrapper functions

```ts
export function addTrack(channel: {id: string; slug: string}, input: {url: string; title: string}) {
	const tx = offlineExecutor.createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug}
	})
	tx.mutate(() => {
		tracksCollection.insert({
			id: crypto.randomUUID(),
			url: input.url,
			title: input.title,
			slug: channel.slug,
			created_at: new Date().toISOString()
		})
	})
	return tx.commit()
}
```

### Direct writes

Write directly to collection + query cache. Bypasses handlers and offline transactions.

```ts
collection.utils.writeInsert(item)
collection.utils.writeUpsert(item) // insert or update
collection.utils.writeUpdate(item)
collection.utils.writeDelete(id)
collection.utils.writeBatch(() => {
	items.forEach((i) => collection.utils.writeUpsert(i))
})
collection.utils.refetch() // manually trigger query refresh
```

Use for: seeding data on login, simple optimistic updates with manual sync, WebSocket updates, pagination.

### Mutation merging

Within a transaction: insert+update → insert (merged), insert+delete → removed, update+update → update (merged), update+delete → delete.

---

## Caching

| Setting     | Where             | Value | Purpose                          |
| ----------- | ----------------- | ----- | -------------------------------- |
| `staleTime` | Collection        | 24h   | Background refetch threshold     |
| `staleTime` | `prefetchQuery()` | 24h   | Must set explicitly (default 0!) |
| `gcTime`    | QueryClient       | 24h   | In-memory lifetime               |
| `maxAge`    | persistence       | 24h   | IDB lifetime (>= staleTime)      |

## Key behaviors

- **Leader election**: One tab processes outbox (prevents duplicate syncs)
- **Retry with backoff**: Failed syncs retry automatically
- **NonRetriableError**: Throw for permanent failures (422, validation errors)
- **Idempotency keys**: Prevent duplicate processing on reload

## Terminology

| Term                               | Source   | What it is                                                        |
| ---------------------------------- | -------- | ----------------------------------------------------------------- |
| **Collection**                     | TanStack | Reactive data store (`tracksCollection`)                          |
| **Mutation**                       | TanStack | Single change: `insert`, `update`, or `delete`                    |
| **Transaction**                    | TanStack | Batch of mutations that commit together                           |
| **Live Query**                     | TanStack | `useLiveQuery()` - reactive query that updates UI                 |
| **Offline Transaction**            | TanStack | `createOfflineTransaction()` - persists to IndexedDB outbox first |
| **Offline Executor**               | TanStack | `startOfflineExecutor()` - manages outbox, leader election, retry |
| **mutationFn**                     | TanStack | Function that syncs a transaction to the server                   |
| `syncTracks`                       | **Ours** | Our mutationFn name - dispatches to SDK by mutation type          |
| `addTrack/updateTrack/deleteTrack` | **Ours** | Standalone functions that create offline transactions             |

## Packages

| Package                          | What it provides                                                  |
| -------------------------------- | ----------------------------------------------------------------- |
| `@tanstack/svelte-db`            | `createCollection()`, `useLiveQuery()`, `eq`                      |
| `@tanstack/query-db-collection`  | `queryCollectionOptions()`, `parseLoadSubsetOptions()`            |
| `@tanstack/svelte-query`         | `QueryClient`, `createQuery`, `queryOptions`                      |
| `@tanstack/offline-transactions` | `startOfflineExecutor()`, `IndexedDBAdapter`, `NonRetriableError` |

## Debugging

```js
// Collection (only has data if useLiveQuery active)
r5.tracksCollection.state.size
;[...r5.tracksCollection.state.values()]

// Query cache (persisted, has data even without active queries)
r5.queryClient
	.getQueryCache()
	.getAll()
	.filter((q) => q.queryKey[0] === 'tracks')
	.map((q) => `${q.queryKey.join('/')}: ${q.state.data?.length ?? 0}`)
```

## Files

```
src/lib/tanstack/
├── collections/                - collection definitions + actions
├── collections.ts              - re-exports
├── query-cache-persistence.ts  - query cache → IndexedDB
├── collection-persistence.ts   - collection state → IndexedDB (disabled)

src/routes/_debug/tanstack/     - test pages
├── demo/+page.svelte           - interactive fetch/cache/collection guide
├── tracks/+page.svelte
└── channels/+page.svelte
```

## References

Append `.md` for raw markdown.

- https://tanstack.com/db/latest/docs/overview.md
- https://tanstack.com/db/latest/docs/guides/mutations.md
- https://tanstack.com/db/latest/docs/guides/live-queries.md
- https://tanstack.com/db/latest/docs/collections/query-collection.md
- https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient.md

For debouncing/throttling mutations, see `usePacedMutations` with `debounceStrategy`/`throttleStrategy` in the mutations guide. For complex multi-collection mutations, see `createOptimisticAction`.
