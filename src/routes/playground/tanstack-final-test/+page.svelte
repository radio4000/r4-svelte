<script>
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte.js'
	import {createTracksCollection} from '$lib/tanstack/subset-collection.js'
	import {eq, ilike, count} from '@tanstack/db'

	// Create tracks collection with on-demand loading
	const tracksCollection = createTracksCollection()
	console.log('[test page] tracksCollection created:', tracksCollection)
	console.log('[test page] tracksCollection.id:', tracksCollection?.id)
	console.log('[test page] tracksCollection.loadSubset:', typeof tracksCollection?.loadSubset)

	// For now, skip channels collection - focus on tracks first
	// const channelsCollection = ...

	// ════════════════════════════════════════════════════════════════════
	// DREAM API - How R5 should work with TanStack DB
	// ════════════════════════════════════════════════════════════════════
	//
	// Based on:
	// - TanStack DB RFC #676 (loadSubset pattern)
	// - R5 scale: ~2k channels, ~150k tracks, 5-5k tracks/channel
	// - User behavior: Browse channels, play tracks, search
	//
	// Key insights:
	// 1. ONE tracks collection (cross-channel queries)
	// 2. Parametrized loading (fetch on-demand per channel)
	// 3. Smart caching (instant on revisit)
	// 4. localStorage persistence (survives refresh)
	// ════════════════════════════════════════════════════════════════════

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 1: Channel Page - Load tracks for specific channel
	// ──────────────────────────────────────────────────────────────────
	let currentSlug = $state('ko002')

	// Dream: useLiveQuery automatically triggers loadSubset with predicates
	console.log('[test page] About to call useLiveQuery with tracksCollection:', tracksCollection)

	const ko002Tracks = useLiveQuery((q) => {
		console.log('[test page] Query function called, q:', q)
		console.log('[test page] tracksCollection inside query:', tracksCollection)
		if (!q) return undefined // Guard against undefined during initialization
		return q
			.from({t: tracksCollection})
			.where(({t}) => eq(t.channel_slug, currentSlug))
			.orderBy(({t}) => t.created_at, 'desc')
			.limit(20)
	})

	console.log('[test page] useLiveQuery returned:', ko002Tracks)
	// Behind scenes:
	// - First visit: tracksCollection.loadSubset({ where: eq(channel_slug, 'ko002'), limit: 20 })
	//   → Fetches from r4, returns Promise<void>, UI shows loading
	// - Revisit: loadSubset checks cache, returns `true`, UI instant (no flicker)

	$inspect('ko002 tracks:', {
		status: ko002Tracks.status,
		count: ko002Tracks.data?.length
	})

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 2: Search - Query across ALL loaded channels
	// ──────────────────────────────────────────────────────────────────
	let searchQuery = $state('')

	// Dream: Search queries local data instantly (no fetching)
	const searchResults = useLiveQuery((q) => {
		if (!searchQuery) return undefined // Conditional query

		return q
			.from({t: tracksCollection})
			.where(({t}) => ilike(t.title, `%${searchQuery}%`))
			.limit(50)
	})
	// Works across all channels user has visited (ko002, 200ok, etc.)
	// Pure local query - no loadSubset call, instant results

	$inspect('search:', {
		query: searchQuery,
		status: searchResults?.status,
		count: searchResults?.data?.length
	})

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 3: Navigation - Switch channels instantly
	// ──────────────────────────────────────────────────────────────────
	function switchChannel(slug) {
		currentSlug = slug
		// When ko002Tracks query re-runs:
		// - If slug='200ok' not loaded: loadSubset fetches, Promise, loading state
		// - If slug='ko002' already loaded: loadSubset returns true, instant
	}

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 4: Infinite Scroll - Load more tracks
	// ──────────────────────────────────────────────────────────────────
	let tracksLimit = $state(20)

	const allKo002Tracks = useLiveQuery((q) =>
		q
			.from({t: tracksCollection})
			.where(({t}) => eq(t.channel_slug, 'ko002'))
			.limit(tracksLimit)
	)
	// When tracksLimit increases from 20→40:
	// - loadSubset({ where: eq(channel_slug, 'ko002'), limit: 40 })
	// - Collection checks: "Do I have 40 tracks for ko002?"
	// - If yes: returns true (instant)
	// - If no (only have 20): fetches next 20, returns Promise

	function loadMore() {
		tracksLimit += 20
	}

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 5: Multi-Channel View - Join channels + tracks
	// ──────────────────────────────────────────────────────────────────
	// TODO: Re-enable once channels collection is created
	// const recentTracksAcrossChannels = useLiveQuery((q) =>
	// 	q
	// 		.from({t: tracksCollection, c: channelsCollection})
	// 		.where(({t, c}) => eq(t.channel_id, c.id))
	// 		.select(({t, c}) => ({
	// 			trackTitle: t.title,
	// 			channelName: c.name,
	// 			channelSlug: c.slug,
	// 			createdAt: t.created_at
	// 		}))
	// 		.orderBy(({t}) => t.created_at, 'desc')
	// 		.limit(10)
	// )

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 6: Mutations - Optimistic updates with backend sync
	// ──────────────────────────────────────────────────────────────────
	function addTrack() {
		tracksCollection.insert({
			id: crypto.randomUUID(),
			channel_slug: currentSlug,
			url: 'https://youtube.com/watch?v=example',
			title: `New Track ${Date.now()}`,
			created_at: new Date().toISOString()
		})
		// Behind scenes (QueryCollection with onInsert handler):
		// 1. Optimistic: Track appears in UI immediately
		// 2. Persist: POST to r4 API
		// 3. Sync back: Server returns with server-computed fields
		// 4. Replace optimistic with real data
		// 5. If error: Rollback optimistic state
	}

	function updateTrack(trackId, changes) {
		tracksCollection.update(trackId, (draft) => {
			Object.assign(draft, changes)
		})
	}

	function deleteTrack(trackId) {
		tracksCollection.delete(trackId)
	}

	// ──────────────────────────────────────────────────────────────────
	// SCENARIO 7: Stats - Aggregations across loaded data
	// ──────────────────────────────────────────────────────────────────
	const trackStats = useLiveQuery((q) =>
		q
			.from({t: tracksCollection})
			.groupBy(({t}) => t.channel_slug)
			.select(({t}) => ({
				channel_slug: t.channel_slug,
				count: count(t.id)
			}))
	)
	// Works across all loaded channels
	// Shows track counts for each channel user has visited

	// ══════════════════════════════════════════════════════════════════
	// WHAT MAKES THIS WORK (Implementation details)
	// ══════════════════════════════════════════════════════════════════
	//
	// tracksCollection is created with:
	//
	// const tracksCollection = createCollection({
	//   id: 'tracks',
	//   getKey: (t) => t.id,
	//   persist: localStorageAdapter('tracks'), // Survives refresh
	//
	//   // RFC #676: loadSubset function
	//   loadSubset: async ({ where, orderBy, limit, subscription }) => {
	//     // 1. Parse where clause to extract channel_slug
	//     const slug = extractSlugFromPredicate(where)
	//
	//     // 2. Check if already loaded
	//     const loadedSlugs = getLoadedSlugs() // Track what we've fetched
	//     if (loadedSlugs.has(slug)) {
	//       return true // Instant, no loading state
	//     }
	//
	//     // 3. Fetch from r4
	//     const tracks = await r5.tracks.r4({ slug, limit })
	//
	//     // 4. Write to collection
	//     begin()
	//     tracks.forEach(t => write({ type: 'insert', value: t }))
	//     commit()
	//
	//     // 5. Mark slug as loaded
	//     loadedSlugs.add(slug)
	//
	//     // 6. Return Promise (resolved after write)
	//     return Promise.resolve()
	//   }
	// })
	//
	// channelsCollection similar but simpler (smaller dataset, can fetch all)
	//
	// ══════════════════════════════════════════════════════════════════
</script>

<h1>R5 TanStack DB Dream API</h1>

<p>
	Demonstrates how R5 should work with TanStack DB once RFC #676 (loadSubset) is implemented. Scale: ~2k channels, ~150k
	tracks, load on-demand as user navigates.
</p>

<!-- Scenario 1: Channel View -->
<section>
	<h2>1. Channel View (on-demand loading)</h2>

	<div>
		<button onclick={() => switchChannel('ko002')}>ko002</button>
		<button onclick={() => switchChannel('200ok')}>200ok</button>
		<button onclick={() => switchChannel('detecteve')}>detecteve</button>
		<span>Current: {currentSlug}</span>
	</div>

	{#if ko002Tracks.isLoading}
		<p>Loading tracks for {currentSlug}...</p>
	{:else if ko002Tracks.data?.length}
		<ul>
			{#each ko002Tracks.data.slice(0, 5) as track}
				<li>
					{track.title}
					<button onclick={() => updateTrack(track.id, {title: track.title + ' [edited]'})}> Edit </button>
					<button onclick={() => deleteTrack(track.id)}>Delete</button>
				</li>
			{/each}
		</ul>
		<p>{ko002Tracks.data.length} tracks loaded</p>
	{:else}
		<p>No tracks</p>
	{/if}

	<button onclick={addTrack}>Add Track</button>
</section>

<!-- Scenario 2: Search -->
<section>
	<h2>2. Global Search (queries local data)</h2>

	<input type="text" bind:value={searchQuery} placeholder="Search tracks..." />

	{#if searchResults?.isLoading}
		<p>Searching...</p>
	{:else if searchResults?.data?.length}
		<ul>
			{#each searchResults.data as track}
				<li>{track.title} (from {track.channel_slug})</li>
			{/each}
		</ul>
	{:else if searchQuery}
		<p>No results for "{searchQuery}"</p>
	{/if}
</section>

<!-- Scenario 4: Infinite Scroll -->
<section>
	<h2>4. Infinite Scroll (incremental loading)</h2>

	<p>Showing {tracksLimit} tracks</p>

	{#if allKo002Tracks.data?.length}
		<p>{allKo002Tracks.data.length} tracks loaded</p>
		<button onclick={loadMore}>Load More</button>
	{/if}
</section>

<!-- Scenario 5: Multi-Channel (disabled for now) -->
<!--
<section>
	<h2>5. Recent Tracks (cross-channel query)</h2>

	{#if recentTracksAcrossChannels.data?.length}
		<ul>
			{#each recentTracksAcrossChannels.data as item}
				<li>{item.trackTitle} - {item.channelName}</li>
			{/each}
		</ul>
	{:else}
		<p>No tracks loaded yet. Visit some channels first.</p>
	{/if}
</section>
-->

<!-- Scenario 7: Stats -->
<section>
	<h2>7. Track Stats (aggregations)</h2>

	{#if trackStats.data?.length}
		<ul>
			{#each trackStats.data as stat}
				<li>{stat.channel_slug}: {stat.count} tracks</li>
			{/each}
		</ul>
	{:else}
		<p>No data yet</p>
	{/if}
</section>

<style>
	section {
		margin: 2rem 0;
		padding: 1rem;
		border: 1px solid var(--border-color, #ccc);
	}

	button {
		margin-right: 0.5rem;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border-color, #eee);
	}

	input {
		width: 100%;
		padding: 0.5rem;
		margin: 0.5rem 0;
	}
</style>
