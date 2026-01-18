<script>
	import {createQuery} from '@tanstack/svelte-query'
	import {queryClient} from '$lib/tanstack/collections/query-client'
	import {browser} from '$app/environment'
	import {demoCollection, demoState, fakeAPI} from './demo-state.svelte'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'

	const QUERY_KEY = ['todos-cached']

	if (browser) {
		// @ts-expect-error exposing for debugging
		window.r5tanstackdemo = {queryClient, demoCollection, fakeAPI}
	}

	/** IDs from the initial data are small numbers (1, 2, 3). Local ones are timestamps. */
	const isLocalId = (/** @type {number} */ id) => id > 100

	// Section 1: Just fetch
	/** @type {import('./demo-state.svelte').DemoTodo[] | null} */
	let fetchResult = $state(null)
	let isFetching = $state(false)

	async function justFetch() {
		isFetching = true
		fetchResult = await fakeAPI.fetch()
		isFetching = false
	}

	// Section 2: fetchQuery with cache
	/** @type {import('./demo-state.svelte').DemoTodo[] | null} */
	let cachedResult = $state(null)

	async function fetchWithCache() {
		const query = queryClient.getQueryCache().find({queryKey: QUERY_KEY})
		const isStale = query ? query.isStale() : true
		const cached = queryClient.getQueryData(QUERY_KEY)
		const willHitCache = cached && !isStale

		cachedResult = await queryClient.fetchQuery({
			queryKey: QUERY_KEY,
			queryFn: () => fakeAPI.fetch(),
			staleTime: 60 * 1000
		})

		if (willHitCache) demoState.cacheHits++
	}

	// Section 3: Invalidation
	let isInvalidating = $state(false)
	let cacheInvalidated = $state(false)

	async function invalidateCache() {
		isInvalidating = true
		await queryClient.invalidateQueries({queryKey: QUERY_KEY})
		isInvalidating = false
		cacheInvalidated = true
	}

	// Section 4: Reactive queries
	let enableReactiveQuery = $state(true)
	const reactiveQuery = createQuery(() => ({
		queryKey: QUERY_KEY,
		queryFn: () => fakeAPI.fetch(),
		staleTime: 60 * 1000,
		enabled: browser && enableReactiveQuery
	}))

	// Section 5: Local writes
	let cacheUpdated = $state(false)

	function addToCache() {
		/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
		const current = queryClient.getQueryData(QUERY_KEY)
		if (!current) return
		queryClient.setQueryData(QUERY_KEY, [
			{id: Date.now(), todo: '→ Added via setQueryData', completed: false, userId: 1},
			...current
		])
		cacheUpdated = true
	}

	// Section 6: Remote writes
	let isAddingPessimistic = $state(false)
	let writeError = $state('')
	let showPessimisticDone = $state(false)
	let showOptimisticDone = $state(false)

	async function addTodoPessimistic() {
		isAddingPessimistic = true
		writeError = ''
		const newTodo = {id: Date.now(), todo: '→ Added (pessimistic)', completed: false, userId: 1}

		try {
			await fakeAPI.add(newTodo, 1500)
			/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
			const previous = queryClient.getQueryData(QUERY_KEY)
			if (previous) {
				queryClient.setQueryData(QUERY_KEY, [newTodo, ...previous])
			}
		} catch {
			writeError = 'Server error'
		} finally {
			isAddingPessimistic = false
			showPessimisticDone = true
		}
	}

	async function addTodoOptimistic() {
		writeError = ''
		const newTodo = {id: Date.now(), todo: '→ Added (optimistic)', completed: false, userId: 1}

		await queryClient.cancelQueries({queryKey: QUERY_KEY})
		/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
		const previous = queryClient.getQueryData(QUERY_KEY)

		if (previous) {
			queryClient.setQueryData(QUERY_KEY, [newTodo, ...previous])
		}
		showOptimisticDone = true

		try {
			if (Math.random() < 0.25) throw new Error('Server error')
			await fakeAPI.add(newTodo, 800)
		} catch {
			queryClient.setQueryData(QUERY_KEY, previous)
			writeError = 'Failed—rolled back.'
		} finally {
			queryClient.invalidateQueries({queryKey: QUERY_KEY})
		}
	}

	// Section 7: Collections
	let collectionItems = $derived([...demoCollection.state.values()].filter(Boolean))

	async function populateCollection() {
		let data = reactiveQuery.data
		if (!data?.length) {
			data = await queryClient.fetchQuery({
				queryKey: QUERY_KEY,
				queryFn: () => fakeAPI.fetch(),
				staleTime: 60 * 1000
			})
		}
		if (!data) return
		for (const todo of data) {
			if (!demoCollection.state.has(todo.id)) {
				demoCollection.insert(todo)
			}
		}
	}

	function addToCollection() {
		demoCollection.insert({id: Date.now(), todo: '→ Added directly to collection', completed: false, userId: 1})
	}

	// Section 8: Live queries
	const liveQuery = useLiveQuery((/** @type {any} */ q) => q.from({todos: demoCollection}))
	/** @type {import('./demo-state.svelte').DemoTodo[]} */
	let liveQueryData = $derived(
		(liveQuery.data ?? [])
			.map((/** @type {{todos: import('./demo-state.svelte').DemoTodo}} */ row) => row.todos)
			.filter(Boolean)
	)

	// Reset everything
	function reset() {
		demoState.networkRequests = 0
		demoState.cacheHits = 0
		fetchResult = null
		cachedResult = null
		cacheUpdated = false
		cacheInvalidated = false
		showPessimisticDone = false
		showOptimisticDone = false
		writeError = ''
		queryClient.removeQueries({queryKey: QUERY_KEY})
		for (const id of demoCollection.state.keys()) {
			demoCollection.delete(id)
		}
		fakeAPI.reset()
	}
</script>

{#snippet todoBlocks(todos)}
	<ul class="items">
		{#each todos as todo (todo.id)}
			<li data-local={isLocalId(todo.id) || undefined}>{todo.id}</li>
		{/each}
	</ul>
{/snippet}

<article class="constrained">
	<menu data-grouped>
		<a href="/_debug/tanstack">&larr;</a>
	</menu>
	<h1>TanStack Query + DB</h1>
	<p>Interactive exploration of TanStack's data fetching and caching abstractions.</p>

	<section>
		<h2>1. Just fetch</h2>
		<p>
			Fetch data, pass it to a template, render HTML. Not every app needs more than this. Click a few times and watch
			the network counter—each click fetches again, even though we already have the data.
		</p>
		<p>
			<button onclick={justFetch} disabled={isFetching}>fetch('/todos')</button>
			{#if demoState.networkRequests > 0}
				<mark>Network requests: {demoState.networkRequests}</mark>
				<button onclick={reset}>Reset</button>
			{/if}
		</p>
		{#if isFetching && demoState.networkRequests === 0}
			<p>Loading...</p>
		{/if}
		{#if demoState.networkRequests > 0 && fetchResult?.length}
			{@render todoBlocks(fetchResult)}
		{/if}
	</section>

	<section>
		<h2>2. Client-side cache</h2>
		<p>
			Fetching the same data repeatedly wastes bandwidth. Wrap your fetch in <code>fetchQuery</code> and TanStack Query
			caches responses in memory by <code>queryKey</code>.
		</p>
		<p>
			<button onclick={fetchWithCache}>fetchQuery('/todos')</button>
			{#if demoState.cacheHits > 0}
				<mark>Cache hits: {demoState.cacheHits}</mark>
			{/if}
		</p>
		{#if cachedResult?.length}
			{@render todoBlocks(cachedResult)}
			<p>Click again. Network requests stay the same—data comes from cache.</p>
		{/if}
		<pre>queryClient.fetchQuery(&#123;
  queryKey: ['todos-cached'],
  queryFn: () => fetch('/todos'),
  staleTime: 60 * 1000
&#125;)</pre>
	</section>

	<section>
		<h2>3. Cache invalidation</h2>
		<p>
			Data now lives in two places: the server (source of truth) and the cache (local copy). When to fetch fresh vs use
			cache? Configure it once:
		</p>
		<ul>
			<li><code>staleTime</code> — how long until data is considered stale. Fresh data comes from cache.</li>
			<li><code>gcTime</code> — how long to keep data in memory before garbage collecting.</li>
		</ul>
		<pre>fetchQuery(&#123; staleTime: 60_000, gcTime: 300_000 &#125;)</pre>
		<p>Invalidate manually. Then try section 2 again—it will refetch.</p>
		<p>
			<button onclick={invalidateCache} disabled={isInvalidating}>invalidateQueries(['todos-cached'])</button>
			{#if cacheInvalidated}
				<mark>Cache invalidated. Try section 2 again.</mark>
			{/if}
		</p>
	</section>

	<section>
		<h2>4. Reactive queries</h2>
		<p>
			<code>createQuery</code> returns a reactive object. Unlike <code>fetchQuery</code>, it fetches automatically and
			watches the cache for changes.
		</p>
		<p>This list uses the same query key as section 2:</p>
		{#if reactiveQuery.isLoading}
			<p>Loading...</p>
		{:else if reactiveQuery.isError}
			<p>Error: {reactiveQuery.error?.message}</p>
		{:else if reactiveQuery.data?.length}
			{@render todoBlocks(reactiveQuery.data)}
		{/if}
		<pre>const query = createQuery(() => (&#123;
  queryKey: ['todos-cached'],
  queryFn: () => fetch('/todos'),
  staleTime: 60 * 1000
&#125;))

// query.data — reactive, updates when cache changes
// query.isLoading, query.isError, query.error</pre>
	</section>

	<section>
		<h2>5. Local writes</h2>
		<p>Write directly to the cache with <code>setQueryData</code>. No network request:</p>
		<p>
			<button onclick={addToCache}>Add todo to cache</button>
		</p>
		{#if cacheUpdated}
			<p>
				Section 4 (reactive) updated immediately. Section 2 (imperative) didn't—call fetchQuery again to see the new
				item.
			</p>
			<p>These items exist only in memory. Refresh and they're gone. Nothing was sent to a server.</p>
		{/if}
		<pre>const current = queryClient.getQueryData(['todos-cached'])
queryClient.setQueryData(['todos-cached'], [newTodo, ...current])</pre>
	</section>

	<aside>
		<p>
			So far: <code>fetchQuery</code> for caching, <code>staleTime</code> for freshness,
			<code>createQuery</code> for reactive subscriptions, <code>setQueryData</code> for local writes.
		</p>
		<p>This covers most apps. But two limitations will eventually bite:</p>
		<ul>
			<li>Refresh the page and the cache is gone</li>
			<li>Each query key is isolated—you can't query across them</li>
		</ul>
	</aside>

	<section>
		<h2>6. Remote writes</h2>
		<p>Section 5 wrote to cache. The server never heard about it.</p>
		{#if reactiveQuery.data?.length}
			{@render todoBlocks(reactiveQuery.data)}
		{/if}

		<p>A pessimistic mutation sends to server, waits, then updates UI:</p>
		<p>
			<button onclick={addTodoPessimistic} disabled={isAddingPessimistic}>
				{isAddingPessimistic ? 'Waiting for server...' : 'Add todo (pessimistic)'}
			</button>
		</p>
		{#if showPessimisticDone}
			<p>Notice the delay?</p>
		{/if}

		<p>An optimistic mutation updates UI first, syncs in background, rolls back on failure:</p>
		<p>
			<button onclick={addTodoOptimistic}>Add todo (optimistic, 25% fails)</button>
			{#if writeError}
				<mark>{writeError}</mark>
			{/if}
		</p>
		{#if showOptimisticDone}
			<p>
				Feels instant, but requires choreography: cancel in-flight queries, snapshot for rollback, optimistic update,
				request, rollback on error, refetch. Every mutation.
			</p>
			<pre>const previous = queryClient.getQueryData(queryKey)
queryClient.setQueryData(queryKey, [newTodo, ...previous])
try &#123;
  await api.addTodo(newTodo)
&#125; catch &#123;
  queryClient.setQueryData(queryKey, previous)
&#125; finally &#123;
  queryClient.invalidateQueries(&#123;queryKey&#125;)
&#125;</pre>
			<p>TanStack DB handles this dance automatically.</p>
		{/if}
	</section>

	<section>
		<h2>7. Collections</h2>
		<p>
			Real apps have many query keys. A forum might cache <code>['topics']</code>,
			<code>['topic', 1, 'comments']</code>,
			<code>['topic', 2, 'comments']</code>, <code>['users']</code>. Each is a separate blob. Want to find all comments
			by a specific user? Show recent activity across topics? You'd have to manually dig through multiple cache entries.
		</p>
		<p>
			And refresh the page—the cache is gone. <strong>Collections</strong> solve both: a local database you can query across
			all your data, persisted to localStorage or IndexedDB.
		</p>

		<div class="two-col">
			<div>
				<h3>Query Cache</h3>
				<code>['todos-cached']</code>
				<p>{reactiveQuery.data?.length ?? 0} items (blob)</p>
				{#if reactiveQuery.data?.length}
					{@render todoBlocks(reactiveQuery.data)}
				{:else}
					<p><small>Loading...</small></p>
				{/if}
			</div>
			<div>
				<h3>Collection</h3>
				<code>demoCollection</code>
				<p>{collectionItems.length} items (queryable)</p>
				{#if collectionItems.length}
					{@render todoBlocks(collectionItems)}
				{:else}
					<p><small>Empty.</small></p>
				{/if}
			</div>
		</div>

		<p>
			<button onclick={populateCollection}>
				{reactiveQuery.data?.length ? 'Copy to collection' : 'Fetch & copy to collection'}
			</button>
			{#if collectionItems.length}
				<button onclick={addToCollection}>Add to collection</button>
			{/if}
		</p>

		{#if collectionItems.length}
			<p>
				Cache and collection are independent. Add to collection—cache doesn't change. Add to cache (section
				5)—collection doesn't change.
			</p>
			<pre>demoCollection.insert(&#123;id: Date.now(), todo: 'New item'&#125;)
[...demoCollection.state.values()]
demoCollection.state.get(id)</pre>
		{/if}
	</section>

	<section>
		<h2>8. Live queries</h2>
		<p>
			<code>useLiveQuery</code> turns collections into reactive queries with SQL-like syntax. Results update incrementally—sub-millisecond,
			even on large datasets.
		</p>

		{#if liveQueryData.length}
			<p>This list subscribes to the collection. Add items above and watch it update:</p>
			{@render todoBlocks(liveQueryData)}
			<pre>const query = useLiveQuery((q) =>
  q.from(&#123;todos: demoCollection&#125;)
   .where((&#123;todos&#125;) => eq(todos.completed, false))
   .orderBy((&#123;todos&#125;) => todos.id, 'desc')
   .limit(10)
)

// query.data is reactive
// query.isLoading, query.isReady, query.status</pre>
			<p>
				This is the payoff: filter, sort, join across all loaded data. Your components declare what shape of data they
				need; the query engine handles the rest.
			</p>
		{:else}
			<p><small>Populate the collection in section 7 first.</small></p>
		{/if}
	</section>

	<section>
		<h2>What's next</h2>
		<p>
			You've seen the progression: raw fetch → cached fetch → reactive queries → local writes → optimistic mutations →
			collections → live queries. Each layer solves a real problem, but adds complexity.
		</p>
		<p>
			TanStack DB bundles the last few layers: collections with persistence, optimistic mutations with auto-rollback,
			and live queries. The boilerplate from section 6 disappears. See
			<a href="/_debug/tanstack">the other demos</a> or
			<a href="https://tanstack.com/db/latest/docs/overview">the official docs</a>.
		</p>
	</section>
</article>

<style>
	article {
		padding-bottom: 10vh;

		h2,
		p,
		ul {
			margin: 1rem 0;
		}
		h2 {
			font-size: var(--font-7);
		}
		pre {
			background: var(--gray-2);
			margin-inline: -1rem;
			padding: 1rem;
			overflow-x: auto;
		}
		button {
			background: var(--accent-9);
			color: var(--accent-1);
			&:disabled {
				background: var(--gray-5);
				color: var(--gray-8);
				cursor: not-allowed;
			}
		}
	}
	section {
		margin-block: 6vh;
	}
	aside {
		margin-block: 8vh;
		padding: 2rem;
		border-block: 1px solid var(--gray-6);
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	ul.items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 1rem 0;

		li {
			padding: 0.25rem 0.5rem;
			background: var(--gray-4);
			border-radius: 3px;
			font-size: var(--font-1);
			font-variant-numeric: tabular-nums;
		}
		li[data-local] {
			background: var(--accent-4);
			outline: 2px dashed var(--accent-8);
		}
	}
</style>
