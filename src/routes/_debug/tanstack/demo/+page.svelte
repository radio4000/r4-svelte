<script>
	import {createQuery, queryOptions} from '@tanstack/svelte-query'
	import {queryClient} from '$lib/tanstack/collections/query-client'
	import {browser} from '$app/environment'
	import {demoCollection, demoState, fakeAPI, SHARED_IDS} from './demo-state.svelte'
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import Menu from '../menu.svelte'
	import {logger} from '$lib/logger'

	const log = logger.ns('demo').seal()

	if (browser) {
		// @ts-expect-error exposing for debugging
		window.r5tanstackdemo = {queryClient, demoCollection, fakeAPI}
	}

	/** IDs from the initial data are small numbers. Local ones are timestamps. */
	const isLocalId = (/** @type {number} */ id) => id > 100

	// ─── queryOptions: define once, reuse everywhere ───
	const todoQueryOpts = queryOptions({
		queryKey: ['todos-demo'],
		queryFn: () => fakeAPI.fetch(),
		staleTime: 60 * 1000
	})

	// Section 1: Just fetch
	/** @type {import('./demo-state.svelte').DemoTodo[] | null} */
	let fetchResult = $state(null)
	let isFetching = $state(false)

	async function justFetch() {
		isFetching = true
		fetchResult = await fakeAPI.fetch()
		isFetching = false
	}

	// Section 2: fetchQuery with cache (uses queryOptions)
	/** @type {import('./demo-state.svelte').DemoTodo[] | null} */
	let cachedResult = $state(null)

	async function fetchWithCache() {
		const query = queryClient.getQueryCache().find({queryKey: todoQueryOpts.queryKey})
		const isStale = query ? query.isStale() : true
		const cached = queryClient.getQueryData(todoQueryOpts.queryKey)
		const willHitCache = cached && !isStale

		cachedResult = await queryClient.fetchQuery(todoQueryOpts)

		if (willHitCache) demoState.cacheHits++
	}

	// Section 3: Invalidation
	let isInvalidating = $state(false)
	let cacheInvalidated = $state(false)

	async function invalidateCache() {
		isInvalidating = true
		await queryClient.invalidateQueries({queryKey: todoQueryOpts.queryKey})
		isInvalidating = false
		cacheInvalidated = true
	}

	// Section 4: Reactive queries (uses same queryOptions)
	let enableReactiveQuery = $state(true)
	const reactiveQuery = createQuery(() => ({
		...todoQueryOpts,
		enabled: browser && enableReactiveQuery
	}))

	// Section 5: Local writes
	let cacheUpdated = $state(false)

	function addToCache() {
		/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
		const current = queryClient.getQueryData(todoQueryOpts.queryKey)
		if (!current) return
		queryClient.setQueryData(todoQueryOpts.queryKey, [
			{id: Date.now(), todo: '→ Added via setQueryData', completed: false},
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
		const newTodo = {id: Date.now(), todo: '→ Added (pessimistic)', completed: false}

		try {
			await fakeAPI.add(newTodo, 1500)
			/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
			const previous = queryClient.getQueryData(todoQueryOpts.queryKey)
			if (previous) queryClient.setQueryData(todoQueryOpts.queryKey, [newTodo, ...previous])
		} catch {
			writeError = 'Server error'
		} finally {
			isAddingPessimistic = false
			showPessimisticDone = true
		}
	}

	async function addTodoOptimistic() {
		writeError = ''
		const newTodo = {id: Date.now(), todo: '→ Added (optimistic)', completed: false}

		await queryClient.cancelQueries({queryKey: todoQueryOpts.queryKey})
		/** @type {import('./demo-state.svelte').DemoTodo[] | undefined} */
		const previous = queryClient.getQueryData(todoQueryOpts.queryKey)

		if (previous) queryClient.setQueryData(todoQueryOpts.queryKey, [newTodo, ...previous])
		showOptimisticDone = true

		try {
			if (Math.random() < 0.25) throw new Error('Server error')
			await fakeAPI.add(newTodo, 800)
		} catch {
			queryClient.setQueryData(todoQueryOpts.queryKey, previous)
			writeError = 'Failed—rolled back.'
		} finally {
			queryClient.invalidateQueries({queryKey: todoQueryOpts.queryKey})
		}
	}

	// ─── Section 7: Normalization ───
	const WORK_KEY = ['todos', 'work']
	const HOME_KEY = ['todos', 'home']

	/** @type {import('./demo-state.svelte').DemoTodo[]} */
	let workResult = $state([])
	/** @type {import('./demo-state.svelte').DemoTodo[]} */
	let homeResult = $state([])

	let workFetched = $state(false)
	let homeFetched = $state(false)

	async function fetchWork() {
		workResult = await queryClient.fetchQuery({
			queryKey: WORK_KEY,
			queryFn: () => fakeAPI.fetchList('work'),
			staleTime: 60 * 1000
		})
		workFetched = true
	}

	async function fetchHome() {
		homeResult = await queryClient.fetchQuery({
			queryKey: HOME_KEY,
			queryFn: () => fakeAPI.fetchList('home'),
			staleTime: 60 * 1000
		})
		homeFetched = true
	}

	function populateCollection() {
		const all = [...workResult, ...homeResult]
		if (!all.length) return
		for (const todo of all) {
			if (!demoCollection.state.has(todo.id)) {
				demoCollection.insert(todo)
			}
		}
		log.info('populateCollection', {inserted: demoCollection.size, liveQueryItems: liveQueryData.length})
	}

	let cacheItemCount = $derived((workResult?.length ?? 0) + (homeResult?.length ?? 0))

	// ─── Section 8: Live queries ───
	// Also drives section 7's collection display. collection.state is a plain Map snapshot (not reactive).
	// useLiveQuery subscribes via SvelteMap + subscribeChanges, so liveQueryData IS reactive.
	const liveQuery = useLiveQuery((/** @type {any} */ q) => q.from({todos: demoCollection}))
	let liveQueryData = $derived(liveQuery.data ?? [])

	const completedQuery = useLiveQuery((/** @type {any} */ q) =>
		q.from({todos: demoCollection}).where((/** @type {any} */ t) => eq(t.todos.completed, true))
	)
	let completedData = $derived(completedQuery.data ?? [])

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
		workResult = []
		homeResult = []
		workFetched = false
		homeFetched = false
		queryClient.removeQueries({queryKey: todoQueryOpts.queryKey})
		queryClient.removeQueries({queryKey: WORK_KEY})
		queryClient.removeQueries({queryKey: HOME_KEY})
		for (const id of demoCollection.state.keys()) {
			demoCollection.delete(id)
		}
		fakeAPI.reset()
	}
</script>

{#snippet todoBlocks(todos, highlightShared)}
	<ul class="items">
		{#each todos as todo (todo.id)}
			<li
				data-local={isLocalId(todo.id) || undefined}
				data-shared={(highlightShared && SHARED_IDS.includes(todo.id)) || undefined}
			>
				{todo.id}
			</li>
		{/each}
	</ul>
{/snippet}

<article class="constrained">
	<Menu />
	<h1>TanStack Query + DB</h1>
	<p>Interactive exploration. Query caches <strong>responses</strong>. DB stores <strong>rows</strong>.</p>

	<section>
		<h2>1. Just fetch</h2>
		<p>
			Fetch data, render it. Click a few times—each click fires a new network request even though we already have the
			data.
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
			{@render todoBlocks(fetchResult, false)}
		{/if}
	</section>

	<section>
		<h2>2. Cached fetch + queryOptions</h2>
		<p>
			Wrap fetch in <code>fetchQuery</code>. Responses are cached by <code>queryKey</code>. Define the config once with
			<code>queryOptions()</code> and reuse it everywhere.
		</p>
		<pre>const todoQueryOpts = queryOptions(&#123;
  queryKey: ['todos-demo'],
  queryFn: () => fakeAPI.fetch(),
  staleTime: 60_000
&#125;)

// reuse:
queryClient.fetchQuery(todoQueryOpts)
queryClient.prefetchQuery(todoQueryOpts)
createQuery(() => (&#123; ...todoQueryOpts &#125;))</pre>
		<p>
			<button onclick={fetchWithCache}>fetchQuery(todoQueryOpts)</button>
			{#if demoState.cacheHits > 0}
				<mark>Cache hits: {demoState.cacheHits}</mark>
			{/if}
		</p>
		{#if cachedResult?.length}
			{@render todoBlocks(cachedResult, false)}
			<p>Click again. Same data, no network request—served from cache.</p>
		{/if}
	</section>

	<section>
		<h2>3. Cache invalidation</h2>
		<p>
			<code>staleTime</code> — how long data is fresh (no refetch).
			<code>gcTime</code> — how long unused data stays in memory. Or invalidate manually:
		</p>
		<p>
			<button onclick={invalidateCache} disabled={isInvalidating}>invalidateQueries(['todos-demo'])</button>
			{#if cacheInvalidated}
				<mark>Cache invalidated. Try section 2 again.</mark>
			{/if}
		</p>
	</section>

	<section>
		<h2>4. Reactive queries</h2>
		<p>
			<code>createQuery</code> is Svelte-specific (React has <code>useQuery</code>). It returns a reactive object that
			stays subscribed to the cache. Unlike <code>fetchQuery</code>, it fetches automatically and watches for changes.
		</p>
		<p>Same queryOptions, different method:</p>
		<pre>const query = createQuery(() => (&#123;
  ...todoQueryOpts,
  enabled: browser
&#125;))
// query.data — reactive
// query.status — 'pending' | 'success' | 'error'</pre>
		{#if reactiveQuery.isLoading}
			<p>Loading...</p>
		{:else if reactiveQuery.isError}
			<p>Error: {reactiveQuery.error?.message}</p>
		{:else if reactiveQuery.data?.length}
			{@render todoBlocks(reactiveQuery.data, false)}
		{/if}
	</section>

	<section>
		<h2>5. Local writes</h2>
		<p>Write directly to the cache with <code>setQueryData</code>. No network request:</p>
		<p>
			<button onclick={addToCache}>setQueryData (add todo)</button>
		</p>
		{#if cacheUpdated}
			<p>Section 4 (reactive) updated instantly. Section 2 (imperative) didn't—it's a snapshot, not a subscription.</p>
		{/if}
	</section>

	<aside>
		<p>
			So far: <code>queryOptions</code> to define once, <code>fetchQuery</code> for caching,
			<code>createQuery</code> for reactivity, <code>setQueryData</code> for local writes.
		</p>
		<p>This covers most apps. Two limitations will eventually bite:</p>
		<ul>
			<li>Each query key is isolated—you can't query across them</li>
			<li>Same entity in multiple responses? Duplicated in cache</li>
		</ul>
	</aside>

	<section>
		<h2>6. Remote writes</h2>
		<p>Section 5 wrote to cache. The server never heard about it.</p>
		{#if reactiveQuery.data?.length}
			{@render todoBlocks(reactiveQuery.data, false)}
		{/if}

		<p>Pessimistic: send to server, wait, then update UI.</p>
		<p>
			<button onclick={addTodoPessimistic} disabled={isAddingPessimistic}>
				{isAddingPessimistic ? 'Waiting for server...' : 'Add todo (pessimistic)'}
			</button>
		</p>
		{#if showPessimisticDone}
			<p>Notice the delay?</p>
		{/if}

		<p>Optimistic: update UI first, sync in background, roll back on failure.</p>
		<p>
			<button onclick={addTodoOptimistic}>Add todo (optimistic, 25% fails)</button>
			{#if writeError}
				<mark>{writeError}</mark>
			{/if}
		</p>
		{#if showOptimisticDone}
			<pre>const previous = queryClient.getQueryData(key)
queryClient.setQueryData(key, [newTodo, ...previous])
try &#123;
  await api.addTodo(newTodo)
&#125; catch &#123;
  queryClient.setQueryData(key, previous) // rollback
&#125;</pre>
			<p>Every mutation requires this choreography. TanStack DB handles it automatically.</p>
		{/if}
	</section>

	<section>
		<h2>7. Normalization — why DB exists</h2>
		<p>
			Two API endpoints return overlapping data. Watch the query cache store duplicates while the collection
			deduplicates by ID.
		</p>

		<p>
			<button onclick={fetchWork} disabled={workFetched}>Fetch "work" list</button>
			<button onclick={fetchHome} disabled={homeFetched}>Fetch "home" list</button>
			{#if workFetched && homeFetched}
				<button onclick={populateCollection} disabled={liveQueryData.length > 0}>→ Pour into collection</button>
			{/if}
		</p>

		{#if workFetched || homeFetched}
			<div class="two-col">
				<div>
					<h3>Query Cache (responses)</h3>
					{#if workFetched}
						<p><code>['todos','work']</code></p>
						{@render todoBlocks(workResult, true)}
					{/if}
					{#if homeFetched}
						<p><code>['todos','home']</code></p>
						{@render todoBlocks(homeResult, true)}
					{/if}
					{#if workFetched && homeFetched}
						<p><strong>{cacheItemCount} items total</strong> (id 12 stored twice)</p>
					{/if}
				</div>
				<div>
					<h3>Collection (rows)</h3>
					{#if liveQueryData.length}
						<p><code>useLiveQuery(q => q.from(collection))</code></p>
						{@render todoBlocks(liveQueryData, true)}
						<p><strong>{liveQueryData.length} unique items</strong> (id 12 stored once)</p>
					{:else if workFetched && homeFetched}
						<p><small>Click "Pour into collection" →</small></p>
					{:else}
						<p><small>Fetch both lists first.</small></p>
					{/if}
				</div>
			</div>
		{/if}

		{#if liveQueryData.length}
			<p>
				This is normalization. Query cached two <strong>responses</strong> (blobs). The collection stores five
				<strong>rows</strong> (entities), deduplicated by ID. Update a row once, everything that references it sees the change.
			</p>
			<p>
				In this demo we manually poured data in. In the real app, <code>queryCollectionOptions()</code>
				does this automatically — it's <code>queryOptions()</code> but with a collection as the destination instead of the
				query cache.
			</p>
		{/if}
	</section>

	<aside>
		<p>
			<strong>Reactive vs one-off:</strong> <code>collection.state</code> and <code>.toArray</code> return plain
			snapshots — great for event handlers and one-time lookups, but wrapping them in <code>$derived</code> won't
			make them reactive. For reactive reads, always use <code>useLiveQuery</code>.
		</p>
	</aside>

	<section>
		<h2>8. Live queries</h2>
		<p>
			Once data is in a collection, <code>useLiveQuery</code> gives you reactive, filtered views across <em>all</em> loaded
			data — regardless of which query key brought it in.
		</p>

		{#if liveQueryData.length}
			<div class="two-col">
				<div>
					<h3>All items</h3>
					<pre>useLiveQuery(q =>
  q.from(&#123;todos: collection&#125;)
)</pre>
					{@render todoBlocks(liveQueryData, true)}
					<p>{liveQueryData.length} items</p>
				</div>
				<div>
					<h3>Completed only</h3>
					<pre>useLiveQuery(q =>
  q.from(&#123;todos: collection&#125;)
   .where(t => eq(t.todos.completed, true))
)</pre>
					{@render todoBlocks(completedData, true)}
					<p>{completedData.length} items</p>
				</div>
			</div>
			<p>
				Filter, sort, join across collections — all reactive, sub-millisecond. Your components declare what data shape
				they need. The query engine handles the rest.
			</p>
		{:else}
			<p><small>Populate the collection in section 7 first.</small></p>
		{/if}
	</section>

	<section>
		<h2>9. The full picture</h2>
		<pre>Network
  ↓ fetchQuery / createQuery
QueryClient cache (responses)
  ↓ queryCollectionOptions
Collection (rows, keyed by ID)
  ↓ useLiveQuery
Component (reactive, filtered)</pre>
		<p>
			Query fetches. DB stores. Live queries read. See <a href="/_debug/tanstack">the other demos</a> or
			<a href="https://tanstack.com/db/latest/docs/overview">the official docs</a>.
		</p>
	</section>
</article>

<style>
	article {
		padding-bottom: 10vh;

		h2 {
		font-size: var(--font-6);
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
		margin-block: 5vh;
		display: flex;
		flex-flow: column;
		gap: 0.5rem;
	}
	aside {
		padding: 1rem;
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
		gap: 0.2rem;
		list-style: none;
		padding: 0;

		li {
			padding: 0.2rem 0.5rem;
			background: var(--gray-4);
			border-radius: var(--border-radius);
			font-size: var(--font-2);
			font-variant-numeric: tabular-nums;
		}
		li[data-local] {
			background: var(--accent-4);
			outline: 2px dashed var(--accent-8);
		}
		li[data-shared] {
			background: var(--yellow-4);
			outline: 2px solid var(--yellow-8);
		}
	}

	pre {
		font-size: var(--font-3);
	}
</style>
