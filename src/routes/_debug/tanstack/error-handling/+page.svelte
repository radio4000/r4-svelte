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
	import Menu from '../menu.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {channelsCollection} from '$lib/collections/channels'
	import {queryClient} from '$lib/collections/query-client'

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

<div class="constrained">
	<Menu />
	<h1>Error Handling</h1>

	<p>
		<code>useLiveQuery.isError</code> doesn't reflect source collection errors. Workaround: subscribe to queryClient
		cache to trigger reactivity.
		<a href="https://github.com/TanStack/db/issues/672">Issue #672</a>
	</p>

	<section>
		<h2>useLiveQuery (broken)</h2>
		<p>query.isError: {query.isError}</p>
	</section>

	<section>
		<h2>Source collection (not reactive)</h2>
		<p>channelsCollection.utils.lastError: {channelsCollection.utils.lastError ?? 'null'}</p>
	</section>

	<section>
		<h2>With cache subscription workaround</h2>
		<p>lastError: {lastError?.message ?? 'null'}</p>
		<p>isError: {isError}</p>
	</section>
</div>
