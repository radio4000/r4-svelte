# TanStack DB for LLMs - Complete Reference

> Comprehensive documentation for TanStack DB integration in Radio4000 R5 project.
> This document combines official TanStack DB documentation with R5-specific migration context.

## Table of Contents

- [Project Context: R5 Migration](#project-context-r5-migration)
- [Core Concepts](#core-concepts)
- [Mental Model](#mental-model)
- [Collections](#collections)
- [Live Queries](#live-queries)
- [Mutations](#mutations)
- [Svelte 5 Integration](#svelte-5-integration)
- [R5 Implementation Guide](#r5-implementation-guide)
- [API Reference](#api-reference)

---

## Project Context: R5 Migration

### Current R5 Architecture

R5 uses three data sources:

1. **PGlite** (client-side PostgreSQL) - primary interface, local reads/writes
2. **Remote PostgreSQL** (radio4000/Supabase) - public reads, authenticated writes
3. **Local JSON + Remote API** (Firebase RTDB v1) - legacy data

Database tables:

```sql
app_state    -- single row (id=1), all application state
channels     -- radio channels (id, name, slug, description, image)
tracks       -- music tracks (id, channel_id, url, title, description, ...)
```

The r5 SDK (`src/lib/r5/index.js`) provides unified data access:

```js
r5.channels.local({limit: 50}) // PGlite
r5.channels.r4({limit: 50}) // Supabase (fetch only)
r5.channels.v1({slug: 'ko002'}) // Firebase
r5.channels.pull({slug, limit}) // fetch + insert + return
r5.tracks.pull({slug, limit}) // requires slug
```

### Migration Goals

**Replace PGlite with TanStack DB** for:

- Reactive client store with sub-millisecond live queries
- Optimistic mutations with automatic rollback
- Client-side joins without SQL views
- Simpler dev experience (no SQL in browser debugging)

**Architecture:**

```
r5 SDK (pure fetch)  →  TanStack Collections  →  Live Queries (components)
├── r5.channels.r4()  →  channelsCollection    →  useLiveQuery()
├── r5.channels.v1()  →  (client-side fallback)
├── r5.tracks.r4()    →  tracksCollection
└── r5.tracks.v1()    →  (client-side fallback)
```

**Key insight**: No sync engine needed (we have REST APIs) → use `QueryCollection`s that fetch via r5.

---

## Core Concepts

### The Three Primitives

TanStack DB = reactive client store with 3 primitives:

1. **Collections** - typed sets of objects
   - `QueryCollection` - fetch data via TanStack Query
   - `LocalStorageCollection` - persist across tabs
   - `LocalOnlyCollection` - in-memory UI state
   - `ElectricCollection`, `TrailBaseCollection`, `RxDBCollection` - sync engines

2. **Live Queries** - reactive filtering/joining (sub-ms performance)
   - Powered by differential dataflow (d2ts)
   - SQL-like API: `from().where().join().select()`
   - Returns collections (queries are composable)

3. **Transactional Mutations** - optimistic by default
   - Instant UI feedback
   - Auto-rollback on error
   - Server write → sync back → drop optimistic state

### How It Works

```tsx
// 1. Define collection with data loading
const todoCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['todos'],
		queryFn: async () => fetch('/api/todos').then((r) => r.json()),
		getKey: (item) => item.id,
		onUpdate: async ({transaction}) => {
			await api.todos.update(transaction.mutations[0])
		}
	})
)

// 2. Query data reactively
const {data: todos} = useLiveQuery((q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, false)))

// 3. Mutate with instant feedback
todoCollection.update(todo.id, (draft) => {
	draft.completed = true // UI updates instantly
}) // → triggers onUpdate → persists → syncs back → drops optimistic state
```

### Unidirectional Data Flow

```
User Action
    ↓
Optimistic Mutation (instant UI update)
    ↓
Mutation Handler (onInsert/onUpdate/onDelete)
    ↓
Backend Persistence
    ↓
Sync Back to Collection
    ↓
Drop Optimistic State → Show Server State
```

Fast inner loop (optimistic) + slower outer loop (server confirmation).

---

## Mental Model

### Collections = Data Sources

Collections decouple **loading data** from **binding data to components**.

```ts
// Load data (various sources)
const channels = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['channels'],
		queryFn: () => r5.channels.r4(), // Supabase
		getKey: (ch) => ch.id
	})
)

// Bind to component
const {data} = useLiveQuery((q) => q.from({channels}))
```

### Live Queries = Reactive Views

Query results update incrementally when underlying data changes:

```ts
const completedTodos = useLiveQuery((q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, true)))
// When a todo.completed changes, query result updates instantly
```

### Mutations = State + Server Write

```ts
collection.update(id, (draft) => {
	draft.status = 'done'
})
// 1. Draft mutation applied locally (optimistic)
// 2. onUpdate handler called → server write
// 3. Wait for sync back
// 4. Drop optimistic, use server data
```

If server write fails → automatic rollback.

---

## Collections

### QueryCollection (REST APIs)

Use for fetching from APIs without real-time sync:

```ts
import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'

const channelsCollection = createCollection(
	queryCollectionOptions({
		queryClient, // Required: pass QueryClient instance from context
		queryKey: ['channels'],
		queryFn: async () => {
			// Fetch with r5→r4 fallback
			const channels = await r5.channels.r4()
			return channels || []
		},
		getKey: (item) => item.id,
		schema: channelSchema, // Zod/Valibot/etc

		// Mutation handlers
		onUpdate: async ({transaction}) => {
			const mutation = transaction.mutations[0]
			await api.channels.update(mutation.original.id, mutation.changes)
			// Auto-refetch after handler (or return { refetch: false })
		},
		onDelete: async ({transaction}) => {
			await api.channels.delete(transaction.mutations[0].original.id)
		}
	})
)
```

**Options:**

- `queryKey` - TanStack Query cache key
- `queryFn` - Fetch function (returns array of items)
- `getKey` - Extract unique ID from item
- `schema` - Standard Schema (Zod, etc) for validation
- `onInsert/onUpdate/onDelete` - Mutation handlers
- `refetchInterval`, `staleTime`, `retry` - TanStack Query options

**Behavior:**

- Auto-refetch after mutations (unless `{ refetch: false }`)
- Full state sync: `queryFn` result = complete collection state
- Empty array = deletes all items

### LocalStorageCollection

For user preferences, UI state that persists across tabs:

```ts
import {localStorageCollectionOptions} from '@tanstack/svelte-db'

const appStateCollection = createCollection(
	localStorageCollectionOptions({
		id: 'app-state',
		storageKey: 'r5-app-state',
		getKey: (item) => item.id,
		schema: appStateSchema,
		// Optional: custom storage backend
		storage: sessionStorage
	})
)
```

**Features:**

- Automatic `localStorage` persistence
- Real-time sync across browser tabs (storage events)
- Optional `sessionStorage` or custom backend

### LocalOnlyCollection

For temporary, session-only data:

```ts
import {localOnlyCollectionOptions} from '@tanstack/svelte-db'

const uiStateCollection = createCollection(
	localOnlyCollectionOptions({
		id: 'ui-state',
		getKey: (item) => item.id,
		schema: uiStateSchema,
		initialData: [{id: 'sidebar', isOpen: false}]
	})
)
```

**Use cases:**

- Form drafts
- Temporary filters
- In-memory caches

### Derived Collections

Live queries return collections → create derived views:

```ts
const completedTodos = createLiveQueryCollection({
	query: (q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, true))
})

// Now use completedTodos as a collection source
const recent = useLiveQuery((q) =>
	q
		.from({completed: completedTodos})
		.orderBy(({completed}) => completed.completedAt, 'desc')
		.limit(10)
)
```

Changes propagate efficiently via differential dataflow.

---

## Live Queries

### Basic Querying

```ts
import {useLiveQuery, eq, gt, and} from '@tanstack/svelte-db'

const {data} = useLiveQuery((q) =>
	q
		.from({todo: todoCollection})
		.where(({todo}) => eq(todo.completed, false))
		.orderBy(({todo}) => todo.createdAt, 'desc')
)
```

### Joins

```ts
const {data: todosWithLists} = useLiveQuery((q) =>
	q
		.from({todo: todoCollection})
		.join(
			{list: listCollection},
			({todo, list}) => eq(todo.listId, list.id),
			'inner' // 'left' | 'right' | 'inner' | 'full'
		)
		.select(({todo, list}) => ({
			id: todo.id,
			title: todo.title,
			listName: list.name
		}))
)
```

**Join types:**

- `left` (default) - all left rows, matched right (optional)
- `inner` - only matching rows
- `right` - all right rows, matched left (optional)
- `full` - all rows from both

### Select Projections

```ts
// Specific fields
const {data} = useLiveQuery((q) =>
	q.from({todo: todoCollection}).select(({todo}) => ({
		id: todo.id,
		text: todo.text
	}))
)

// Computed fields
const {data} = useLiveQuery((q) =>
	q.from({todo: todoCollection}).select(({todo}) => ({
		...todo, // Spread all fields
		isOverdue: gt(new Date(), todo.dueDate)
	}))
)
```

### Aggregations

```ts
import {count, sum, avg, min, max} from '@tanstack/svelte-db'

const {data: stats} = useLiveQuery((q) =>
	q
		.from({order: ordersCollection})
		.groupBy(({order}) => order.customerId)
		.select(({order}) => ({
			customerId: order.customerId,
			totalOrders: count(order.id),
			totalAmount: sum(order.amount),
			avgOrder: avg(order.amount)
		}))
		.having(({order}) => gt(sum(order.amount), 1000))
)
```

### Expression Functions

**Comparison:**

- `eq(a, b)` - equality
- `gt(a, b)`, `gte(a, b)` - greater than (or equal)
- `lt(a, b)`, `lte(a, b)` - less than (or equal)
- `like(str, pattern)`, `ilike(str, pattern)` - pattern matching
- `inArray(value, array)` - array membership
- `isNull(value)`, `isUndefined(value)` - null checks

**Logical:**

- `and(...conditions)`
- `or(...conditions)`
- `not(condition)`

**String:**

- `upper(str)`, `lower(str)` - case conversion
- `length(str)` - string/array length
- `concat(...strs)` - concatenation

**Math:**

- `add(a, b)`
- `coalesce(...values)` - first non-null

**Aggregates:**

- `count(value)`, `sum(value)`, `avg(value)`, `min(value)`, `max(value)`

### Pagination & Sorting

```ts
const {data: page2} = useLiveQuery(
	(q) =>
		q
			.from({todo: todoCollection})
			.orderBy(({todo}) => todo.createdAt, 'desc')
			.limit(20)
			.offset(20) // Skip first page
)
```

### Conditional Queries (Svelte 5)

```ts
const {data, isEnabled} = useLiveQuery(
	(q) => {
		if (!userId) return undefined // Disable query

		return q.from({todos: todosCollection}).where(({todos}) => eq(todos.userId, userId))
	},
	[userId]
)

// When disabled: data = undefined, isEnabled = false
```

### FindOne

```ts
const {data: user} = useLiveQuery(
	(q) =>
		q
			.from({users: usersCollection})
			.where(({users}) => eq(users.id, userId))
			.findOne() // Returns User | undefined (not array)
)
```

### Distinct

```ts
const {data: countries} = useLiveQuery(
	(q) =>
		q
			.from({user: usersCollection})
			.select(({user}) => ({country: user.country}))
			.distinct() // Requires select()
)
```

### Functional Variants (when standard API insufficient)

```ts
// Complex JavaScript logic
const {data} = useLiveQuery((q) =>
	q
		.from({user: usersCollection})
		.fn.where((row) => {
			return (
				row.user.active && (row.user.age > 25 || row.user.role === 'admin') && row.user.email.includes('@company.com')
			)
		})
		.fn.select((row) => ({
			id: row.user.id,
			fullName: `${row.user.firstName} ${row.user.lastName}`.trim(),
			emailDomain: row.user.email.split('@')[1]
		}))
)
```

**Warning:** Functional variants bypass query optimizer. Use sparingly.

---

## Mutations

### Collection Write Operations

```ts
// Insert
todoCollection.insert({
	id: crypto.randomUUID(),
	text: 'Buy milk',
	completed: false
})

// Update (Immer-like draft pattern)
todoCollection.update(todoId, (draft) => {
	draft.completed = true
	draft.completedAt = new Date()
})

// Delete
todoCollection.delete(todoId)

// Batch operations
todoCollection.update([id1, id2], (drafts) => {
	drafts.forEach((draft) => {
		draft.status = 'archived'
	})
})
```

**Returns:** `Transaction` object for lifecycle tracking.

### Mutation Handlers

```ts
const todoCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['todos'],
		queryFn: async () => fetch('/api/todos').then(r => r.json()),
		getKey: (item) => item.id,
		onInsert: async ({transaction}) => {
			await Promise.all(transaction.mutations.map((m) => api.todos.create(m.modified)))
			// Auto-refetch unless: return { refetch: false }
		},
		onUpdate: async ({transaction}) => {
			await Promise.all(transaction.mutations.map((m) => api.todos.update(m.original.id, m.changes)))
		},
		onDelete: async ({transaction}) => {
			await Promise.all(transaction.mutations.map((m) => api.todos.delete(m.original.id)))
		}
	})
)
```

**Mutation object:**

```ts
{
	collection: Collection
	type: 'insert' | 'update' | 'delete'
	original: Item // For update/delete
	modified: Item // For insert/update
	changes: Partial<Item> // For update
	key: string | number
	metadata: Record<string, unknown>
}
```

### Custom Actions

For complex operations or intent-based mutations:

```ts
import {createOptimisticAction} from '@tanstack/svelte-db'

const likePost = createOptimisticAction<string>({
	onMutate: (postId) => {
		// Optimistic update
		postCollection.update(postId, (draft) => {
			draft.likeCount += 1
			draft.likedByMe = true
		})
	},
	mutationFn: async (postId) => {
		await api.posts.like(postId)
		await postCollection.utils.refetch()
	}
})

// Use
likePost(postId)
```

**Use cases:**

- Multi-collection mutations
- Server determines actual state changes
- Sending user intent vs exact state

### Manual Transactions

For multi-step workflows:

```ts
import {createTransaction} from '@tanstack/svelte-db'

const tx = createTransaction({
	autoCommit: false,
	mutationFn: async ({transaction}) => {
		await api.batchUpdate(transaction.mutations)
	}
})

// Step 1
tx.mutate(() => {
	todoCollection.update(id1, (draft) => {
		draft.status = 'reviewed'
	})
})

// Step 2 (user confirms)
tx.mutate(() => {
	todoCollection.update(id2, (draft) => {
		draft.status = 'reviewed'
	})
})

// Commit all at once
await tx.commit()
// OR cancel: tx.rollback()
```

### Non-Optimistic Mutations

Wait for server confirmation before applying locally:

```ts
const tx = todoCollection.delete(id, {optimistic: false})

try {
	await tx.isPersisted.promise
	navigate('/todos') // Only after server confirms
} catch (error) {
	toast.error('Delete failed')
}
```

### Transaction States

- `pending` - Optimistic mutations can be applied
- `persisting` - Executing mutation handler
- `completed` - Successfully persisted + synced
- `failed` - Error thrown, optimistic rolled back

```ts
const tx = todoCollection.update(id, (draft) => {
	draft.done = true
})

console.log(tx.state) // 'pending'

await tx.isPersisted.promise
console.log(tx.state) // 'completed' or 'failed'
```

### Mutation Merging

Within a transaction, mutations on the same item merge:

| Existing + New  | Result    | Notes                          |
| --------------- | --------- | ------------------------------ |
| insert + update | `insert`  | Merged changes, empty original |
| insert + delete | _removed_ | Cancel out                     |
| update + update | `update`  | Union changes, first original  |
| update + delete | `delete`  | Delete wins                    |

### Error Handling

```ts
import {SchemaValidationError, DuplicateKeyError} from '@tanstack/svelte-db'

try {
	const tx = todoCollection.insert(newTodo)
	await tx.isPersisted.promise
} catch (error) {
	if (error instanceof SchemaValidationError) {
		console.log(error.issues) // [{message, path}]
	} else if (error instanceof DuplicateKeyError) {
		console.log('Already exists')
	}
}
```

Automatic rollback on error.

---

## Svelte 5 Integration

### Installing

```bash
npm install @tanstack/svelte-db @tanstack/query-db-collection
```

### Setup QueryClient

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import {QueryClient, QueryClientProvider} from '@tanstack/svelte-query'

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5 // 5 minutes
			}
		}
	})

	const {children} = $props()
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
```

### useLiveQuery Hook

```svelte
<script>
	import {useLiveQuery, eq} from '@tanstack/svelte-db'

	const {
		data: todos,
		isLoading,
		isError,
		status
	} = useLiveQuery((q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, false)))
</script>

{#if isLoading}
	<p>Loading...</p>
{:else if isError}
	<p>Error loading todos</p>
{:else}
	<ul>
		{#each todos as todo (todo.id)}
			<li>{todo.text}</li>
		{/each}
	</ul>
{/if}
```

**Return value:**

- `data` - Svelte store with query results
- `isLoading`, `isReady`, `isError`, `isEnabled` - Status flags
- `status` - 'idle' | 'loading' | 'ready' | 'error' | 'disabled'
- `state`, `collection` - Internal state

### Component Example

```svelte
<script>
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {channelsCollection} from '$lib/collections'

	let searchTerm = $state('')

	const {data: channels} = useLiveQuery(
		(q) => {
			let query = q.from({channel: channelsCollection})

			if (searchTerm) {
				query = query.where(({channel}) =>
					or(ilike(channel.name, `%${searchTerm}%`), ilike(channel.slug, `%${searchTerm}%`))
				)
			}

			return query.orderBy(({channel}) => channel.name, 'asc')
		},
		[searchTerm]
	) // Re-run when searchTerm changes
</script>

<input bind:value={searchTerm} placeholder="Search channels..." />

<ul>
	{#each channels as channel (channel.id)}
		<li>
			<a href="/{channel.slug}">{channel.name}</a>
		</li>
	{/each}
</ul>
```

### Mutations in Components

```svelte
<script>
	import {todosCollection} from '$lib/collections'

	async function toggleTodo(todo) {
		const tx = todosCollection.update(todo.id, (draft) => {
			draft.completed = !draft.completed
		})

		try {
			await tx.isPersisted.promise
			// Success feedback
		} catch (error) {
			// Error handling
			console.error(error)
		}
	}
</script>

<button onclick={() => toggleTodo(todo)}>
	{todo.completed ? 'Undo' : 'Complete'}
</button>
```

---

## R5 Implementation Guide

### Phase 1: Collections

**File:** `src/lib/collections.ts`

```ts
import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {localStorageCollectionOptions} from '@tanstack/svelte-db'
import {r5} from '$lib/r5'
import {channelSchema, trackSchema, appStateSchema} from '$lib/schemas'

// App State (localStorage)
export const appStateCollection = createCollection(
	localStorageCollectionOptions({
		id: 'app-state',
		storageKey: 'r5-app-state',
		getKey: (item) => item.id,
		schema: appStateSchema
	})
)

// Channels (QueryCollection with r4→v1 fallback)
export const channelsCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['channels'],
		queryFn: async () => {
			// Try r4 first, fallback to v1
			let channels = await r5.channels.r4()
			if (!channels || channels.length === 0) {
				channels = await r5.channels.v1()
			}
			return channels
		},
		getKey: (ch) => ch.id,
		schema: channelSchema,

		onUpdate: async ({transaction}) => {
			// Update via r4 SDK
			const mutation = transaction.mutations[0]
			await r5.channels.update(mutation.original.id, mutation.changes)
		},
		onDelete: async ({transaction}) => {
			await r5.channels.delete(transaction.mutations[0].original.id)
		}
	})
)

// Tracks (QueryCollection)
export const tracksCollection = createCollection(
	queryCollectionOptions({
		queryClient,
		queryKey: ['tracks'],
		queryFn: async ({queryKey}) => {
			// Fetch tracks for all channels in channelsCollection
			const channels = await r5.channels.local()
			const trackPromises = channels.map((ch) => r5.tracks.r4({slug: ch.slug}))
			const trackArrays = await Promise.all(trackPromises)

			// Flatten and denormalize
			return trackArrays.flat().map((track) => ({
				...track,
				channel_slug: channels.find((ch) => ch.id === track.channel_id)?.slug
			}))
		},
		getKey: (track) => track.id,
		schema: trackSchema,

		onUpdate: async ({transaction}) => {
			const mutation = transaction.mutations[0]
			await r5.tracks.update(mutation.original.id, mutation.changes)
		},
		onDelete: async ({transaction}) => {
			await r5.tracks.delete(transaction.mutations[0].original.id)
		}
	})
)
```

### Phase 2: Replace PGlite in Routes

**Homepage** (`src/routes/+page.svelte`):

```svelte
<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {channelsCollection} from '$lib/collections'

	const {data: channels, isLoading} = useLiveQuery((q) =>
		q.from({channel: channelsCollection}).orderBy(({channel}) => channel.name, 'asc')
	)

	function refreshChannels() {
		channelsCollection.utils.refetch()
	}
</script>

{#if isLoading}
	<p>Loading channels...</p>
{:else}
	<button onclick={refreshChannels}>Refresh</button>
	<ul>
		{#each channels as channel (channel.id)}
			<li>
				<a href="/{channel.slug}">{channel.name}</a>
			</li>
		{/each}
	</ul>
{/if}
```

**Channel Page** (`src/routes/[slug]/+page.svelte`):

```svelte
<script>
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {channelsCollection, tracksCollection} from '$lib/collections'
	import {page} from '$app/state'

	const slug = $derived(page.params.slug)

	// Channel
	const {data: channels} = useLiveQuery((q) =>
		q
			.from({channel: channelsCollection})
			.where(({channel}) => eq(channel.slug, slug))
			.findOne()
	)
	const channel = $derived($channels)

	// Tracks
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
	<p>{channel.description}</p>

	<ul>
		{#each $tracks as track (track.id)}
			<li>{track.title} - {track.url}</li>
		{/each}
	</ul>
{/if}
```

### Phase 3: App State Migration

Replace `$lib/app-state.svelte` PGlite dependency:

```svelte
<!-- src/lib/app-state.svelte -->
<script context="module">
	import {appStateCollection} from '$lib/collections'

	// Initialize if empty
	const initialState = {
		id: 1,
		volume: 0.8,
		currentTrackId: null
		// ... other state
	}

	const existing = appStateCollection.get(1)
	if (!existing) {
		appStateCollection.insert(initialState)
	}

	// Reactive proxy
	export const appState = $state({
		get volume() {
			return appStateCollection.get(1)?.volume ?? 0.8
		},
		set volume(value) {
			appStateCollection.update(1, (draft) => {
				draft.volume = value
			})
		}
		// ... other properties
	})
</script>
```

### Phase 4: Client-Side Joins

Replace SQL `tracks_with_meta` views:

```svelte
<script>
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {channelsCollection, tracksCollection} from '$lib/collections'

	const {data: tracksWithChannels} = useLiveQuery((q) =>
		q
			.from({track: tracksCollection})
			.join({channel: channelsCollection}, ({track, channel}) => eq(track.channel_id, channel.id), 'inner')
			.select(({track, channel}) => ({
				id: track.id,
				title: track.title,
				url: track.url,
				channelName: channel.name,
				channelSlug: channel.slug
			}))
	)
</script>
```

### Cleanup

After migration complete:

1. Remove `src/lib/r5/db.js`
2. Remove `src/lib/migrations/`
3. Remove PGlite from `package.json`
4. Archive `docs/local-database.md`

---

## API Reference

### Collection Creation

```ts
import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'

const collection = createCollection(options)
```

### QueryCollectionOptions

```ts
queryCollectionOptions({
  // Required
  queryClient: QueryClient,
  queryKey: string[],
  queryFn: () => Promise<Item[]>,
  getKey: (item: Item) => string | number,

  // Optional
  schema?: StandardSchema,
  id?: string,

  // Mutation handlers
  onInsert?: async ({ transaction }) => void | { refetch: boolean },
  onUpdate?: async ({ transaction }) => void | { refetch: boolean },
  onDelete?: async ({ transaction }) => void | { refetch: boolean },

  // TanStack Query options
  enabled?: boolean,
  staleTime?: number,
  refetchInterval?: number,
  retry?: number,
  retryDelay?: number,
  select?: (data) => Item[]
})
```

### LocalStorageCollectionOptions

```ts
localStorageCollectionOptions({
  id: string,
  storageKey: string,
  getKey: (item) => string | number,
  schema?: StandardSchema,
  storage?: Storage  // Default: localStorage
})
```

### LocalOnlyCollectionOptions

```ts
localOnlyCollectionOptions({
  id: string,
  getKey: (item) => string | number,
  schema?: StandardSchema,
  initialData?: Item[]
})
```

### Collection Methods

```ts
collection.insert(item | items, options?)
collection.update(key | keys, options?, (draft) => void)
collection.delete(key | keys, options?)
collection.get(key)
collection.has(key)
collection.toArray
collection.utils.refetch()
collection.cleanup()
collection.preload()
```

**Options:**

- `metadata?: Record<string, unknown>` - Custom metadata
- `optimistic?: boolean` - Enable/disable optimistic updates (default: true)

### Transaction Object

```ts
const tx = collection.update(...)

tx.state  // 'pending' | 'persisting' | 'completed' | 'failed'
tx.isPersisted.promise  // Promise<void>
tx.error  // { message, error } or undefined
tx.commit()  // For manual transactions
tx.rollback()  // For manual transactions
tx.mutate(() => void)  // For manual transactions
```

### Query Builder Methods

```ts
q.from({ alias: collection })
 .where(({ alias }) => expression)
 .join({ alias2: collection2 }, ({ alias, alias2 }) => eq(...), joinType?)
 .select(({ alias }) => ({ ... }))
 .groupBy(({ alias }) => field | [field1, field2])
 .having(({ alias }) => expression)
 .orderBy(({ alias }) => field, 'asc' | 'desc')
 .limit(n)
 .offset(n)
 .distinct()
 .findOne()
```

### Expression Functions

```ts
// Comparison
eq(a, b), gt(a, b), gte(a, b), lt(a, b), lte(a, b)
like(str, pattern), ilike(str, pattern)
inArray(value, array)
isNull(value), isUndefined(value)

// Logical
and(...), or(...), not(...)

// String
upper(str), lower(str), length(str), concat(...)

// Math
add(a, b), coalesce(...)

// Aggregates
count(field), sum(field), avg(field), min(field), max(field)
```

### Error Types

```ts
import {
	SchemaValidationError,
	DuplicateKeyError,
	CollectionInErrorStateError,
	MissingHandlerError,
	TransactionError
} from '@tanstack/svelte-db'

try {
	collection.insert(item)
} catch (error) {
	if (error instanceof SchemaValidationError) {
		console.log(error.issues) // [{ message, path }]
	}
}
```

### Svelte 5 Hooks

```ts
const { data, isLoading, isReady, isError, isEnabled, status } = useLiveQuery(
  (q) => Query,
  dependencies?
)

// data: Writable<Item[]>
// status: 'idle' | 'loading' | 'ready' | 'error' | 'disabled'
```

---

## Best Practices

### R5-Specific

1. **Use r5 SDK for fetching** - Keep data access through r5.channels.r4(), r5.tracks.r4()
2. **Client-side denormalization** - Add `channel_slug` to tracks in queryFn
3. **Leverage derived collections** - Cache expensive queries as intermediate collections
4. **App state in localStorage** - Use LocalStorageCollection for app_state table

### General

1. **Schema validation** - Always provide Zod/Valibot schemas
2. **Optimistic by default** - Use `{ optimistic: false }` only when necessary
3. **Handle errors** - Check `tx.isPersisted.promise` for critical operations
4. **Cleanup on unmount** - Let Svelte handle via `useLiveQuery`
5. **Batch mutations** - Use transactions for multi-step changes
6. **Direct writes sparingly** - Prefer normal mutations unless handling WebSocket events

### Performance

1. **Set staleTime** - Avoid unnecessary refetches
2. **Use select projections** - Only return needed fields
3. **Leverage indexing** - Collections automatically index by `getKey`
4. **Batch operations** - Use array forms of insert/update/delete
5. **Conditional queries** - Return `undefined` to disable unused queries

---

## Resources

- [TanStack DB Docs](https://tanstack.com/db/latest/docs/overview)
- [Interactive Guide](https://frontendatscale.com/blog/tanstack-db/)
- [R5 Project Docs](./index.md)
- [R5 SDK Reference](./r5-sdk.md)
- [Migration Plan](./tanstack.md)

---

## Quick Reference Card

```ts
// Collections
const col = createCollection(queryCollectionOptions({
  queryClient,
  queryKey: ['items'],
  queryFn: () => api.getItems(),
  getKey: (item) => item.id,
  onUpdate: ({ transaction }) => api.update(...)
}))

// Queries
const { data } = useLiveQuery((q) =>
  q.from({ item: col })
   .where(({ item }) => eq(item.active, true))
   .join({ user: users }, ({ item, user }) => eq(item.userId, user.id))
   .select(({ item, user }) => ({ ...item, userName: user.name }))
   .orderBy(({ item }) => item.created, 'desc')
   .limit(10)
)

// Mutations
col.insert({ id: '1', name: 'Item' })
col.update('1', draft => { draft.name = 'Updated' })
col.delete('1')

const tx = col.update('1', draft => { draft.done = true })
await tx.isPersisted.promise

// Actions
const doThing = createOptimisticAction({
  onMutate: (id) => col.update(id, ...),
  mutationFn: async (id) => {
    await api.doThing(id)
    await col.utils.refetch()
  }
})
```
