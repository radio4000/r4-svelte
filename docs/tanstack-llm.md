# TanStack DB Guide

> Practical patterns for TanStack DB in R5 (Svelte 5 + REST APIs)

## Why TanStack DB

**Problem:** Traditional approaches force a choice between view-specific endpoints (API sprawl) or load-everything-and-filter (cascading re-renders).

**TanStack DB:** Client-side reactive database layer using differential dataflow for sub-millisecond updates. Load normalized collections once, perform incremental joins locally.

## Core Pattern

```ts
// 1. Collection (data source)
const todos = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['todos'],
		queryFn: () => fetch('/api/todos').then((r) => r.json()),
		getKey: (item) => item.id,
		onUpdate: async ({transaction}) => {
			await api.update(transaction.mutations[0])
		}
	})
)

// 2. Live Query (reactive view)
const {data} = useLiveQuery((q) => q.from({todo: todos}).where(({todo}) => eq(todo.completed, false)))

// 3. Mutation (optimistic + server sync)
todos.update(id, (draft) => {
	draft.completed = true
})
```

**Flow:** Optimistic mutation (instant UI) → handler fires → server persists → sync back → drop optimistic state. Auto-rollback on error.

## R5 Architecture

```
r5.channels.r4() → channelsCollection → useLiveQuery()
r5.tracks.r4()   → tracksCollection   → useLiveQuery()
```

No sync engine needed—REST APIs + QueryCollections handle everything.

## Collection Types

**QueryCollection** — REST APIs via TanStack Query

```ts
createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['channels'],
		queryFn: () => r5.channels.r4(),
		getKey: (ch) => ch.id,
		schema: channelSchema,
		onUpdate: async ({transaction}) => {
			const m = transaction.mutations[0]
			await api.update(m.original.id, m.changes)
		}
	})
)
```

Auto-refetch after mutations. Return `{refetch: false}` to disable.

**LocalStorageCollection** — Persists across tabs

```ts
createCollection(
	localStorageCollectionOptions({
		id: 'app-state',
		storageKey: 'r5-app-state',
		getKey: (item) => item.id,
		schema: appStateSchema
	})
)
```

**LocalOnlyCollection** — In-memory (form drafts, temp filters)

```ts
createCollection(
	localOnlyCollectionOptions({
		id: 'ui-state',
		getKey: (item) => item.id,
		initialData: [{id: 'sidebar', isOpen: false}]
	})
)
```

## Live Queries

**Basic pattern:**

```ts
const {data} = useLiveQuery((q) =>
	q
		.from({todo: todos})
		.where(({todo}) => eq(todo.completed, false))
		.orderBy(({todo}) => todo.createdAt, 'desc')
)
```

**Joins:**

```ts
q.from({track: tracks})
	.join({channel: channels}, ({track, channel}) => eq(track.channel_id, channel.id), 'inner')
	.select(({track, channel}) => ({
		...track,
		channelName: channel.name
	}))
```

Join types: `left` (default), `inner`, `right`, `full`.

**Aggregations:**

```ts
import {count, sum, avg} from '@tanstack/svelte-db'

q.from({order: orders})
	.groupBy(({order}) => order.customerId)
	.select(({order}) => ({
		customerId: order.customerId,
		total: sum(order.amount)
	}))
	.having(({order}) => gt(sum(order.amount), 1000))
```

**Conditional queries:**

```ts
useLiveQuery(
	(q) => {
		if (!userId) return undefined // Disables query
		return q.from({todos}).where(({todos}) => eq(todos.userId, userId))
	},
	[userId]
)
```

**Common operators:** `eq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `inArray`, `and`, `or`, `not`, `isNull`

**Utilities:** `.findOne()`, `.distinct()`, `.limit(n)`, `.offset(n)`

**Warning:** Use `.fn.where()` / `.fn.select()` for complex JS logic, but bypass optimizer—use sparingly.

## Mutations

**Basic operations:**

```ts
col.insert({id: '1', text: 'Buy milk'})
col.update(id, (draft) => {
	draft.completed = true
})
col.delete(id)
col.update([id1, id2], (drafts) => drafts.forEach((d) => (d.archived = true)))
```

**Handlers** (defined in collection options):

```ts
onUpdate: async ({transaction}) => {
	const m = transaction.mutations[0]
	await api.update(m.original.id, m.changes)
}
```

Mutation object: `{type, original, modified, changes, key}`

**Custom actions** (multi-collection, intent-based):

```ts
import {createOptimisticAction} from '@tanstack/svelte-db'

const likePost = createOptimisticAction({
	onMutate: (id) => posts.update(id, (d) => d.likes++),
	mutationFn: async (id) => {
		await api.like(id)
		await posts.utils.refetch()
	}
})
```

**Transaction tracking:**

```ts
const tx = col.update(id, (d) => (d.done = true))
await tx.isPersisted.promise // Wait for server confirmation
tx.state // 'pending' | 'persisting' | 'completed' | 'failed'
```

**Non-optimistic** (wait for server first):

```ts
const tx = col.delete(id, {optimistic: false})
await tx.isPersisted.promise
```

**Error handling:** Auto-rollback on failure. Check `SchemaValidationError`, `DuplicateKeyError`.

## Svelte 5 Integration

**Setup:**

```svelte
<!-- +layout.svelte -->
<script>
	import {QueryClient, QueryClientProvider} from '@tanstack/svelte-query'
	const queryClient = new QueryClient({
		defaultOptions: {queries: {staleTime: 1000 * 60 * 5}}
	})
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
```

**R5 Import Pattern** (patched for async mode):

```svelte
<script>
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {eq, or, ilike} from '@tanstack/svelte-db'
</script>
```

**Component usage:**

```svelte
<script>
	let search = $state('')

	const {data: channels, isLoading} = useLiveQuery(
		(q) => {
			let query = q.from({channel: channelsCollection})
			if (search) {
				query = query.where(({channel}) => or(ilike(channel.name, `%${search}%`), ilike(channel.slug, `%${search}%`)))
			}
			return query.orderBy(({channel}) => channel.name, 'asc')
		},
		[search]
	)
</script>

{#if isLoading}
	<p>Loading...</p>
{:else}
	<input bind:value={search} />
	{#each channels as ch (ch.id)}
		<a href="/{ch.slug}">{ch.name}</a>
	{/each}
{/if}
```

**Mutations:**

```svelte
<script>
	async function toggle(todo) {
		const tx = todos.update(todo.id, (d) => {
			d.completed = !d.completed
		})
		try {
			await tx.isPersisted.promise
		} catch (error) {
			console.error('Update failed:', error)
		}
	}
</script>
```

## R5 Implementation

**Collections** (`src/lib/collections.ts`):

```ts
import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, localStorageCollectionOptions} from '@tanstack/query-db-collection'
import {r5} from '$lib/r5'

// App state (localStorage)
export const appStateCollection = createCollection(
	localStorageCollectionOptions({
		id: 'app-state',
		storageKey: 'r5-app-state',
		getKey: (item) => item.id,
		schema: appStateSchema
	})
)

// Channels (r4→v1 fallback)
export const channelsCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['channels'],
		queryFn: async () => {
			let ch = await r5.channels.r4()
			if (!ch?.length) ch = await r5.channels.v1()
			return ch
		},
		getKey: (ch) => ch.id,
		schema: channelSchema,
		onUpdate: async ({transaction}) => {
			const m = transaction.mutations[0]
			await r5.channels.update(m.original.id, m.changes)
		}
	})
)

// Tracks (denormalize with channel_slug)
export const tracksCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['tracks'],
		queryFn: async () => {
			const channels = await r5.channels.local()
			const tracksArrays = await Promise.all(channels.map((ch) => r5.tracks.r4({slug: ch.slug})))
			return tracksArrays.flat().map((track) => ({
				...track,
				channel_slug: channels.find((ch) => ch.id === track.channel_id)?.slug
			}))
		},
		getKey: (t) => t.id
	})
)
```

**Page usage:**

```svelte
<!-- +page.svelte -->
<script>
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {eq} from '@tanstack/svelte-db'
	import {page} from '$app/state'

	const slug = $derived(page.params.slug)

	const {data: channel} = useLiveQuery((q) =>
		q
			.from({channel: channelsCollection})
			.where(({channel}) => eq(channel.slug, slug))
			.findOne()
	)

	const {data: tracks} = useLiveQuery(
		(q) =>
			q
				.from({track: tracksCollection})
				.where(({track}) => eq(track.channel_slug, slug))
				.orderBy(({track}) => track.created_at, 'desc'),
		[slug]
	)
</script>

{#if channel}
	<h1>{channel.name}</h1>
	{#each tracks as track (track.id)}
		<li>{track.title}</li>
	{/each}
{/if}
```

**App state proxy:**

```ts
// app-state.svelte
import {appStateCollection} from '$lib/collections'

if (!appStateCollection.get(1)) {
	appStateCollection.insert({id: 1, volume: 0.8})
}

export const appState = $state({
	get volume() {
		return appStateCollection.get(1)?.volume ?? 0.8
	},
	set volume(v) {
		appStateCollection.update(1, (d) => {
			d.volume = v
		})
	}
})
```

## Best Practices

**R5-specific:**

- Use r5 SDK for fetching (r5.channels.r4(), r5.tracks.r4())
- Denormalize in queryFn (add channel_slug to tracks)
- LocalStorageCollection for app_state
- Client-side joins via live queries (no SQL views)

**General:**

- Schema validation (Zod/Valibot)
- Optimistic by default
- Set staleTime to avoid refetches
- Use select projections (return only needed fields)
- Batch operations (array forms)
- Conditional queries (return undefined to disable)

## Quick Reference

```ts
// Collection
const col = createCollection(queryCollectionOptions({
  queryClient, queryKey: ['items'], queryFn: () => api.get(),
  getKey: (i) => i.id, onUpdate: ({transaction}) => api.update(...)
}))

// Query
const {data} = useLiveQuery((q) =>
  q.from({item: col})
   .where(({item}) => eq(item.active, true))
   .join({user}, ({item, user}) => eq(item.userId, user.id))
   .select(({item, user}) => ({...item, userName: user.name}))
   .orderBy(({item}) => item.created, 'desc')
   .limit(10)
)

// Mutation
col.insert({id: '1', name: 'Item'})
col.update('1', d => { d.name = 'Updated' })
const tx = col.delete('1')
await tx.isPersisted.promise

// Custom action
const doThing = createOptimisticAction({
  onMutate: (id) => col.update(id, ...),
  mutationFn: async (id) => { await api.do(id); await col.utils.refetch() }
})
```
