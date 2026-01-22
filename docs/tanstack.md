# TanStack DB

Reactive collections with offline-first mutations + remote sync via @radio4000/sdk.

## Why TanStack DB?

TanStack Query alone: fetch, cache, persist. But data is **blobs per query key** - can't query across them.

TanStack DB adds:

- **Queryable in-memory store** with SQL-like syntax
- **Live queries** that re-render on data changes
- **Cross-collection queries** (query all tracks, not just per-slug)
- **Optimistic mutations** with automatic rollback

```js
// Query cache has separate blobs: ['tracks', 'starttv'], ['tracks', 'blink']
// Can't query across them with Query alone.

// DB collection lets you query ALL loaded tracks:
const recentTracks = useLiveQuery((q) =>
	q
		.from({tracks: tracksCollection})
		.where(({tracks}) => eq(tracks.channel_id, channelId))
		.orderBy(({tracks}) => tracks.created_at, 'desc')
		.limit(50)
)
// Also: leftJoin, groupBy, having, distinct, findOne(), count(), sum(), avg()
```

## The Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Remote (Supabase)                                              │
│    Source of truth. Fetched via sdk.                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ fetchQuery / prefetchQuery / useLiveQuery
┌─────────────────────────────────────────────────────────────────┐
│  Query Cache (TanStack Query)                                   │
│    Persisted to IndexedDB. Keyed by query key.                  │
│    ['tracks', 'starttv'] → 263 items (blob)                     │
│    ['tracks', 'blink'] → 340 items (blob)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ useLiveQuery (with queryCollectionOptions)
┌─────────────────────────────────────────────────────────────────┐
│  Collection (TanStack DB)                                       │
│    In-memory Map. Queryable. Reactive.                          │
│    tracksCollection.state → all tracks from active queries      │
└─────────────────────────────────────────────────────────────────┘
```

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

## One-Off Queries

### From collection (if data already loaded)

```js
// Single item by ID
const track = tracksCollection.get(id)

// Query in-memory
const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === slug)
const tracks = [...tracksCollection.state.values()].filter((t) => t.channel_id === id)
```

### From remote (one-time fetch)

```js
// Fetch and return data (updates query cache, not collection)
const data = await queryClient.fetchQuery({
	queryKey: ['tracks', slug],
	queryFn: () => fetchTracksBySlug(slug)
})

// Fetch and cache for later (no return, silent errors)
await queryClient.prefetchQuery({
	queryKey: ['channels'],
	queryFn: fetchAllChannels,
	staleTime: 24 * 60 * 60 * 1000
})
```

### Fetch + populate collection

```js
// Pattern from ensureTracksLoaded()
const data = await queryClient.fetchQuery({...})
tracksCollection.utils.writeBatch(() => {
  for (const track of data) {
    tracksCollection.utils.writeUpsert(track)
  }
})
```

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
| `@tanstack/svelte-query`         | `QueryClient`                                                     |
| `@tanstack/offline-transactions` | `startOfflineExecutor()`, `IndexedDBAdapter`, `NonRetriableError` |

## Mutations

### Online-only (simple)

```ts
const todoCollection = createCollection({
	onInsert: async ({transaction}) => {
		await api.create(transaction.mutations[0].modified)
		return {refetch: false} // skip automatic refetch
	}
})
todoCollection.insert({id, text}) // fires onInsert
todoCollection.insert({id, text}, {optimistic: false}) // wait for server
```

### Offline-first (what we use)

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

// Usage
await addTrack(userChannel, {url, title})
```

## Direct Writes (bypass sync)

Write directly to collection + query cache. No optimistic layer, no remote sync.

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

Use for: seeding on login, WebSocket updates, pagination.

### Mutation merging

When multiple mutations target the same item within a transaction: insert+update → insert (merged), insert+delete → removed, update+update → update (merged), update+delete → delete.

## QueryClient Primitives

The `queryClient` is a cache you can inspect and manipulate directly:

```js
// Read from cache
queryClient.getQueryData(['tracks', slug])

// Write to cache
queryClient.setQueryData(['tracks', slug], data)

// Mark stale, trigger refetch on next access
queryClient.invalidateQueries({queryKey: ['tracks']})

// Clear from cache entirely
queryClient.removeQueries({queryKey: ['tracks', slug]})

// Inspect all cached queries
queryClient.getQueryCache().getAll()
```

Query keys are hierarchical - invalidate broadly (`['tracks']`) or precisely (`['tracks', 'starttv']`).

**fetchQuery vs useQuery**: imperative (call when you want) vs declarative (reactive to component lifecycle).

## Caching

| Setting     | Where             | Value | Purpose                          |
| ----------- | ----------------- | ----- | -------------------------------- |
| `staleTime` | Collection        | 24h   | Background refetch threshold     |
| `staleTime` | `prefetchQuery()` | 24h   | Must set explicitly (default 0!) |
| `gcTime`    | QueryClient       | 24h   | In-memory lifetime               |
| `maxAge`    | persistence       | 24h   | IDB lifetime (>= staleTime)      |

## Debugging

```js
// Collection (only has data if useLiveQuery active)
r5.tracksCollection.state.size
[...r5.tracksCollection.state.values()]

// Query cache (persisted, has data even without active queries)
r5.queryClient.getQueryCache().getAll()
  .filter(q => q.queryKey[0] === 'tracks')
  .map(q => `${q.queryKey.join('/')}: ${q.state.data?.length ?? 0}`)
```

## Key behaviors

- **Leader election**: One tab processes outbox (prevents duplicate syncs)
- **Retry with backoff**: Failed syncs retry automatically
- **NonRetriableError**: Throw for permanent failures (422, validation errors)
- **Idempotency keys**: Prevent duplicate processing on reload

## Files

```
src/lib/tanstack/
├── collections/             - collection definitions + actions
├── collections.ts           - re-exports
├── query-cache-persistence.ts  - query cache → IndexedDB
├── collection-persistence.ts   - collection state → IndexedDB (disabled)

src/lib/components/
└── sync-status.svelte

src/routes/_debug/tanstack/   - test pages
├── demo/+page.svelte      - interactive fetch/cache/collection guide
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

## Tips

LIMIT and OFFSET queries require an ORDER BY clause for deterministic results
