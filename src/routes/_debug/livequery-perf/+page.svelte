<script lang="ts">
	import {tracksCollection, ensureTracksLoaded, queryClient} from '$lib/tanstack/collections'
	import QueryTest from './query-test.svelte'

	let slug = $state('200ok')
	let mounted = $state(true) // Start mounted for navigation test
	let loading = $state(false)
	let loadResult = $state('')
	let mountCount = $state(0)

	// Collection stats
	const collectionSize = $derived(tracksCollection.state.size)
	const tracksForSlug = $derived([...tracksCollection.state.values()].filter((t) => t.slug === slug).length)

	// Cache info
	const cacheInfo = $derived(() => {
		const query = queryClient.getQueryCache().find({queryKey: ['tracks', slug]})
		if (!query) return 'No cache entry'
		const data = query.state.data as unknown[]
		return `${data?.length ?? 0} items, ${query.isStale() ? 'stale' : 'fresh'}`
	})

	async function loadTracks() {
		loading = true
		loadResult = ''
		const start = performance.now()
		try {
			const before = tracksForSlug
			await ensureTracksLoaded(slug)
			const after = [...tracksCollection.state.values()].filter((t) => t.slug === slug).length
			const duration = performance.now() - start
			loadResult = `Loaded in ${duration.toFixed(2)}ms. Before: ${before}, After: ${after} tracks`
		} catch (err) {
			loadResult = `Error: ${(err as Error).message}`
		} finally {
			loading = false
		}
	}

	function toggleMount() {
		if (!mounted) {
			mountCount++
		}
		mounted = !mounted
	}

	function remount() {
		if (mounted) {
			mounted = false
			setTimeout(() => {
				mountCount++
				mounted = true
			}, 50)
		}
	}
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>useLiveQuery Performance Test</h1>
	<p>
		This page tests the performance of <code>useLiveQuery</code> by mounting/unmounting a component that queries tracks for
		a channel.
	</p>

	<section>
		<h2>1. Setup</h2>
		<label>
			Channel slug:
			<input type="text" bind:value={slug} style="width: 200px" />
		</label>
		<button onclick={loadTracks} disabled={loading}>
			{loading ? 'Loading...' : 'Load tracks into collection'}
		</button>
		{#if loadResult}
			<p><code>{loadResult}</code></p>
		{/if}
	</section>

	<section>
		<h2>2. Collection State</h2>
		<pre>Total in collection: {collectionSize}
Tracks for "{slug}": {tracksForSlug}
Cache: {cacheInfo()}</pre>
	</section>

	<section>
		<h2>3. Mount/Unmount Test</h2>
		<p>Open the browser console to see timing logs.</p>
		<div style="display: flex; gap: 1rem; align-items: center;">
			<button onclick={toggleMount}>
				{mounted ? 'Unmount' : 'Mount'} useLiveQuery
			</button>
			{#if mounted}
				<button onclick={remount}>Re-mount (unmount + mount)</button>
			{/if}
			<span>Mount count: {mountCount}</span>
		</div>
	</section>

	<section>
		<h2>3b. Navigation Test</h2>
		<p>Test the real slow path: navigate away, then back. Query remounts on route change.</p>
		<div style="display: flex; gap: 1rem; align-items: center;">
			<a href="/_debug">Go to /_debug (no query)</a>
			<span>→ then back here</span>
		</div>
		<p><small>Keep console open. Watch mount timing on return.</small></p>
	</section>

	<section>
		<h2>4. Query Component</h2>
		{#if mounted}
			{#key mountCount}
				<QueryTest {slug} />
			{/key}
		{:else}
			<p><em>Component not mounted</em></p>
		{/if}
	</section>

	<section>
		<h2>Instructions</h2>
		<ol>
			<li>Enter a channel slug with many tracks (e.g., "200ok", "starttv")</li>
			<li>Click "Load tracks" to ensure data is in the collection</li>
			<li>Open browser DevTools console</li>
			<li>Click "Mount useLiveQuery" to create the query</li>
			<li>Check console for timing breakdown</li>
			<li>Click "Unmount" then "Mount" again to test re-creation time</li>
			<li>Copy/paste console output for analysis</li>
		</ol>
	</section>
</div>

<style>
	.constrained {
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
	}
	section {
		margin-bottom: 1rem;
		padding: 1rem;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
	}
	h2 {
		margin-top: 0;
	}
	pre {
		background: #1a1a1a;
		padding: 1rem;
		overflow-x: auto;
	}
	code {
		background: #1a1a1a;
		padding: 0.2rem 0.4rem;
	}
	button {
		padding: 0.5rem 1rem;
	}
	input {
		padding: 0.5rem;
		background: #1a1a1a;
		border: 1px solid #333;
		color: inherit;
	}
</style>
