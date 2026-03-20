<script lang="ts">
	import {tick} from 'svelte'
	import {browser} from '$app/environment'
	import {createCollection} from '@tanstack/svelte-db'
	import {localOnlyCollectionOptions} from '@tanstack/db'
	import {queryCollectionOptions} from '@tanstack/query-db-collection'
	import {createQuery, queryOptions} from '@tanstack/svelte-query'
	import Menu from '../menu.svelte'
	import {queryClient} from '$lib/collections/query-client'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'

	type AssertionResult = {
		pass: boolean
		details: string[]
	}

	type LocalItem = {
		id: number
		title: string
		done: boolean
	}

	type CacheItem = {
		id: string
		label: string
	}

	type ErrorItem = {
		id: string
		label: string
	}

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
	const settle = async () => {
		await tick()
		await sleep(30)
	}

	async function waitFor(check: () => boolean, timeout = 1500) {
		const startedAt = Date.now()
		while (Date.now() - startedAt < timeout) {
			if (check()) return
			await sleep(20)
		}
		throw new Error('Timed out waiting for assertion state')
	}

	const localSeed: LocalItem[] = [
		{id: 1, title: 'open row', done: false},
		{id: 2, title: 'done row', done: true}
	]

	const localCollection = createCollection<LocalItem, number>(
		localOnlyCollectionOptions({
			id: 'tanstack-assertions-local',
			getKey: (item) => item.id
		})
	)

	let nextLocalId = 3

	function resetLocalCollection() {
		for (const id of [...localCollection.state.keys()]) {
			localCollection.delete(id)
		}
		localCollection.insert(localSeed.map((item) => ({...item})))
		nextLocalId = 3
	}

	resetLocalCollection()

	const localQuery = useLiveQuery(localCollection)

	let localItems = $derived(localQuery.data ?? [])
	let snapshotDoneCount = $derived([...localCollection.state.values()].filter((item) => item.done).length)
	const readLiveDoneCount = () => (localQuery.data ?? []).filter((item) => item.done).length

	const cacheKey = ['tanstack', 'assertions', 'cache']
	let cacheFetchCount = 0
	let cacheEnabled = $state(false)

	const cacheOptions = queryOptions({
		queryKey: cacheKey,
		staleTime: 60_000,
		queryFn: async (): Promise<CacheItem[]> => {
			cacheFetchCount++
			await sleep(20)
			return [
				{id: 'server-1', label: 'from queryFn'},
				{id: 'server-2', label: 'still from queryFn'}
			]
		}
	})

	const cacheQuery = createQuery(() => ({
		...cacheOptions,
		enabled: cacheEnabled
	}))

	function readCacheState() {
		const entry = queryClient.getQueryCache().find({queryKey: cacheKey})
		return {
			exists: Boolean(entry),
			size: Array.isArray(entry?.state.data) ? entry.state.data.length : 0,
			stale: entry ? entry.isStale() : null
		}
	}

	let errorMode: 'success' | 'error' = 'success'
	let errorEnabled = $state(false)

	const errorCollection = createCollection<ErrorItem, string>({
		...queryCollectionOptions({
			queryKey: () => ['tanstack', 'assertions', 'error'],
			syncMode: 'on-demand',
			queryClient,
			getKey: (item) => item.id,
			staleTime: 60_000,
			queryFn: async (): Promise<ErrorItem[]> => {
				await sleep(20)
				if (errorMode === 'error') throw new Error('assertion error from queryFn')
				return [{id: 'ok-1', label: 'healthy row'}]
			}
		})
	})

	const errorQuery = useLiveQuery((q) => {
		if (!errorEnabled) return null
		return q.from({rows: errorCollection}).orderBy(({rows}) => rows.id)
	})

	let errorVersion = $state(0)
	$effect(() => {
		return queryClient.getQueryCache().subscribe(() => errorVersion++)
	})

	let errorMessage = $derived.by(() => {
		void errorVersion
		return errorCollection.utils.lastError instanceof Error ? errorCollection.utils.lastError.message : ''
	})

	let collectionIsError = $derived.by(() => {
		void errorVersion
		return errorCollection.utils.isError
	})

	let localResult = $state<AssertionResult | null>(null)
	let cacheResult = $state<AssertionResult | null>(null)
	let errorResult = $state<AssertionResult | null>(null)
	let pageError = $state('')

	function localSnapshot() {
		return {
			liveDoneCount: readLiveDoneCount(),
			snapshotDoneCount
		}
	}

	async function safeRun(run: () => Promise<void>) {
		pageError = ''
		try {
			await run()
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Assertion run failed'
		}
	}

	async function runLocalAssertions() {
		pageError = ''
		resetLocalCollection()
		await settle()

		const before = localSnapshot()

		localCollection.insert({id: nextLocalId++, title: 'inserted done row', done: true})
		await settle()
		const afterInsert = localSnapshot()

		localCollection.update(1, (draft) => {
			draft.done = true
		})
		await settle()
		const afterUpdate = localSnapshot()

		localCollection.delete(2)
		await settle()
		const afterDelete = localSnapshot()

		const pass =
			before.liveDoneCount === 1 &&
			before.snapshotDoneCount === 1 &&
			afterInsert.liveDoneCount === 2 &&
			afterInsert.snapshotDoneCount === 1 &&
			afterUpdate.liveDoneCount === 3 &&
			afterUpdate.snapshotDoneCount === 1 &&
			afterDelete.liveDoneCount === 2 &&
			afterDelete.snapshotDoneCount === 1

		localResult = {
			pass,
			details: [
				`before live=${before.liveDoneCount} snapshot=${before.snapshotDoneCount}`,
				`after insert live=${afterInsert.liveDoneCount} snapshot=${afterInsert.snapshotDoneCount}`,
				`after update live=${afterUpdate.liveDoneCount} snapshot=${afterUpdate.snapshotDoneCount}`,
				`after delete live=${afterDelete.liveDoneCount} snapshot=${afterDelete.snapshotDoneCount}`
			]
		}
	}

	async function runCacheAssertions() {
		pageError = ''
		cacheFetchCount = 0
		cacheEnabled = false
		cacheResult = null
		queryClient.removeQueries({queryKey: cacheKey})
		await tick()

		cacheEnabled = true
		await waitFor(() => (cacheQuery.data?.length ?? 0) === 2)

		const before = {
			fetches: cacheFetchCount,
			reactiveSize: cacheQuery.data?.length ?? 0,
			...readCacheState()
		}

		queryClient.setQueryData(cacheKey, [
			...(cacheQuery.data ?? []),
			{id: 'local-3', label: 'added via setQueryData'} satisfies CacheItem
		])
		await waitFor(() => (cacheQuery.data?.length ?? 0) === 3)

		const afterSet = {
			reactiveSize: cacheQuery.data?.length ?? 0,
			...readCacheState()
		}

		cacheEnabled = false
		await tick()
		await queryClient.invalidateQueries({queryKey: cacheKey})

		const afterInvalidate = readCacheState()

		const pass =
			before.fetches === 1 &&
			before.reactiveSize === 2 &&
			before.stale === false &&
			afterSet.reactiveSize === 3 &&
			afterSet.size === 3 &&
			afterInvalidate.stale === true

		cacheResult = {
			pass,
			details: [
				`before fetches=${before.fetches} reactive=${before.reactiveSize} stale=${before.stale}`,
				`after setQueryData reactive=${afterSet.reactiveSize} cache=${afterSet.size}`,
				`after invalidate stale=${afterInvalidate.stale}`
			]
		}
	}

	async function runErrorAssertions() {
		pageError = ''
		errorResult = null
		errorMode = 'success'
		errorEnabled = true
		await errorCollection.utils.refetch().catch(() => {})
		await tick()

		errorMode = 'error'
		await errorCollection.utils.refetch().catch(() => {})
		await waitFor(() => errorQuery.isError && collectionIsError && errorMessage.length > 0)

		const pass = errorQuery.isError && collectionIsError && errorMessage.includes('assertion error from queryFn')

		errorResult = {
			pass,
			details: [
				`query.isError=${errorQuery.isError}`,
				`collection.utils.isError=${collectionIsError}`,
				`lastError=${errorMessage || 'none'}`,
				'known rough edge upstream; this page asserts the observable app path'
			]
		}
	}

	async function runAllAssertions() {
		pageError = ''
		try {
			await runLocalAssertions()
			await runCacheAssertions()
			await runErrorAssertions()
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Assertion run failed'
		}
	}

	if (browser) {
		// @ts-expect-error debug route
		window.r5TanstackAssertions = {
			runAllAssertions,
			runLocalAssertions,
			runCacheAssertions,
			runErrorAssertions,
			getLocalItems: () => localQuery.data,
			getLiveDoneCount: () => readLiveDoneCount(),
			getSnapshotDoneCount: () => snapshotDoneCount,
			getCacheState: () => readCacheState(),
			getErrorState: () => ({
				queryIsError: errorQuery.isError,
				collectionIsError,
				errorMessage
			})
		}
	}
</script>

<div class="constrained">
	<Menu />
	<h1>TanStack assertions</h1>
	<p>
		Local checks for the contracts in <code>docs/tanstack.md</code>. The tutorial explains things. This page proves
		them.
	</p>

	<menu>
		<button onclick={runAllAssertions}>Run all</button>
		<button onclick={() => safeRun(runLocalAssertions)}>Run local reactivity</button>
		<button onclick={() => safeRun(runCacheAssertions)}>Run query cache</button>
		<button onclick={() => safeRun(runErrorAssertions)}>Run error state</button>
	</menu>

	{#if pageError}
		<p class="error" role="alert">{pageError}</p>
	{/if}

	<section>
		<h2>1. local collection reactivity</h2>
		<p>
			<code>useLiveQuery</code> should react to local mutations. A derived read from <code>collection.state</code> should
			stay stale.
		</p>
		<p>Status: <strong>{localResult ? (localResult.pass ? 'pass' : 'fail') : 'not run'}</strong></p>
		<p>Current rows: {localItems.length} • Snapshot done count: {snapshotDoneCount}</p>

		{#if localItems.length}
			<ul>
				{#each localItems as item (item.id)}
					<li>
						<code>{item.id}</code>
						{item.title}
						{item.done ? 'done' : 'open'}
					</li>
				{/each}
			</ul>
		{/if}

		{#if localResult}
			<pre>{localResult.details.join('\n')}</pre>
		{/if}
	</section>

	<section>
		<h2>2. query cache assertions</h2>
		<p>
			<code>setQueryData</code> should update <code>createQuery</code> subscribers immediately. Invalidating an inactive query
			should leave it stale.
		</p>
		<p>Status: <strong>{cacheResult ? (cacheResult.pass ? 'pass' : 'fail') : 'not run'}</strong></p>
		<p>
			Subscriber rows: {cacheQuery.data?.length ?? 0} • Cache rows: {readCacheState().size} • Stale: {String(
				readCacheState().stale
			)}
		</p>

		{#if cacheResult}
			<pre>{cacheResult.details.join('\n')}</pre>
		{/if}
	</section>

	<section>
		<h2>3. error state</h2>
		<p>Known rough edge upstream. This route keeps the failure visible and asserts the path we rely on in the app.</p>
		<p>Status: <strong>{errorResult ? (errorResult.pass ? 'pass' : 'fail') : 'not run'}</strong></p>
		<p><code>query.isError</code>: {String(errorQuery.isError)}</p>
		<p><code>collection.utils.isError</code>: {String(collectionIsError)}</p>
		<p><code>collection.utils.lastError</code>: {errorMessage || 'none'}</p>

		{#if errorResult}
			<pre>{errorResult.details.join('\n')}</pre>
		{/if}
	</section>
</div>

<style>
	section {
		margin-block-start: 2rem;
	}

	pre {
		background: var(--gray-2);
		padding: 1rem;
		overflow-x: auto;
	}

	menu {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	ul {
		padding-inline-start: 1.25rem;
	}

	strong {
		text-transform: uppercase;
	}

	.error {
		color: var(--red-9);
	}
</style>
