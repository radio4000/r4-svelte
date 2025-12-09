<script>
	/**
	 * TanStack DB Error Handling in Svelte
	 *
	 * Problem: useLiveQuery doesn't expose errors reactively
	 * - query.isError doesn't reflect source collection errors
	 * - sourceCollection.utils.lastError exists but isn't reactive
	 *
	 * Workaround: Subscribe to queryClient cache to trigger reactivity
	 * See: https://github.com/TanStack/db/issues/672
	 */
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {channelsCollection, queryClient} from '../collections'

	const query = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.orderBy(({channels}) => channels.slug)
			.limit(3)
	)

	// WORKAROUND: Subscribe to query cache to trigger reactivity
	let cacheVersion = $state(0)
	$effect(() => {
		return queryClient.getQueryCache().subscribe(() => cacheVersion++)
	})

	// These re-read when cacheVersion changes (void suppresses "unused" warning)
	let lastError = $derived.by(() => (void cacheVersion, channelsCollection.utils.lastError))
	let isError = $derived.by(() => (void cacheVersion, channelsCollection.utils.isError))
</script>

<h1>TanStack Error Handling Test</h1>

<h2>useLiveQuery (doesn't work for errors)</h2>
query.isError: {query.isError}<br />

<h2>Source collection (not reactive without workaround)</h2>
channelsCollection.utils.lastError: {channelsCollection.utils.lastError ?? 'null'}<br />

<h2>With cache subscription workaround (reactive)</h2>
lastError: {lastError?.message ?? 'null'}<br />
isError: {isError}<br />
