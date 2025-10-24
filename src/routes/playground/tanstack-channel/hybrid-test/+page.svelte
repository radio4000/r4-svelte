<script>
	import {createQuery} from '@tanstack/svelte-query'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {tracksCollection} from '$lib/collections'
	import {eq} from '@tanstack/svelte-db'
	import {r5} from '$lib/r5'

	let channelSlug = $state('oskar')
	let trackLimit = $state(10)

	// Fetch tracks via createQuery (lazy, per-channel, cached)
	const tracksQuery = createQuery(() => {
		console.log('createQuery reactive dependencies:', channelSlug, trackLimit)
		return {
			queryKey: ['tracks', channelSlug, trackLimit],
			queryFn: async () => {
				console.log(`Fetching tracks for ${channelSlug}...`)
				const tracks = await r5.tracks.r4({slug: channelSlug, limit: trackLimit})

				// Insert into collection for global access
				const denormalized = tracks.map((t) => ({...t, channel_slug: channelSlug}))
				console.log('Inserting into collection:', denormalized.length, 'tracks')

				try {
					denormalized.forEach((track) => {
						const existing = tracksCollection.get(track.id)
						if (!existing) {
							console.log('Inserting track:', track.id, track.title)
							tracksCollection.insert(track)
						} else {
							console.log('Updating track:', track.id, track.title)
							tracksCollection.update(track.id, () => track)
						}
					})
					console.log('Collection now has:', tracksCollection.toArray.length, 'tracks')
				} catch (error) {
					console.error('Collection insert error:', error)
				}

				return denormalized
			}
		}
	})

	// Hydrate collection from query data (handles cache hits)
	$effect(() => {
		if (tracksQuery.data) {
			console.log('Hydrating collection from query data:', tracksQuery.data.length, 'tracks')
			tracksQuery.data.forEach((track) => {
				const existing = tracksCollection.get(track.id)
				if (!existing) {
					console.log('Inserting track:', track.id)
					tracksCollection.insert(track)
				} else {
					tracksCollection.update(track.id, () => track)
				}
			})
			console.log('Collection now has:', tracksCollection.toArray.length, 'tracks')
		}
	})

	// Query the collection reactively (global state)
	const collectionTracksQuery = useLiveQuery(
		(q) => {
			if (!channelSlug) return undefined
			return q
				.from({track: tracksCollection})
				.where(({track}) => eq(track.channel_slug, channelSlug))
				.orderBy(({track}) => track.created_at, 'desc')
		},
		[channelSlug]
	)
	const collectionTracks = $derived(collectionTracksQuery.data)

	// Show all tracks in collection (across all channels)
	const allTracksQuery = useLiveQuery((q) => q.from({track: tracksCollection}))
	const allTracks = $derived(allTracksQuery.data)

	// Debug
	$inspect(collectionTracks)
	$inspect(allTracks)

	function clearCollection() {
		const ids = tracksCollection.toArray.map((t) => t.id)
		tracksCollection.delete(ids)
	}
</script>

<div class="SmallContainer" style:display="flex" style:flex-direction="column" style:gap="1rem">
	<header>
		<h1>Hybrid Pattern Test</h1>
		<p>createQuery fetches → inserts into tracksCollection → useLiveQuery reacts</p>
	</header>

	<section>
		<h2>Controls</h2>
		<div class="row" style:gap="0.5rem" style:align-items="end">
			<label style:flex="1">
				Channel slug:
				<input type="text" bind:value={channelSlug} />
			</label>
			<label>
				Track limit:
				<input type="number" bind:value={trackLimit} min="5" step="5" style:width="8rem" />
			</label>
			<button onclick={clearCollection}>Clear Collection</button>
		</div>
	</section>

	<section>
		<h2>createQuery Result (fetch layer)</h2>
		<dl class="meta">
			<dt>Status</dt>
			<dd>{tracksQuery.status}</dd>
			<dt>Is Loading</dt>
			<dd>{tracksQuery.isLoading}</dd>
			<dt>Is Fetching</dt>
			<dd>{tracksQuery.isFetching}</dd>
			<dt>Data Status</dt>
			<dd>{tracksQuery.data ? `${tracksQuery.data.length} tracks` : 'null'}</dd>
		</dl>
		{#if tracksQuery.isLoading}
			<p>Loading...</p>
		{:else if tracksQuery.isError}
			<p style:color="var(--red-9)">Error: {tracksQuery.error.message}</p>
		{:else if tracksQuery.data}
			<p>Fetched {tracksQuery.data.length} tracks from API</p>
			<details>
				<summary>Show tracks</summary>
				<ul>
					{#each tracksQuery.data as track}
						<li>{track.title}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	<section>
		<h2>useLiveQuery on Collection (reactive layer)</h2>
		{#if collectionTracks}
			<p>Collection has {collectionTracks.length} tracks for "{channelSlug}"</p>
			<details>
				<summary>Show tracks</summary>
				<ul>
					{#each collectionTracks as track}
						<li>{track.title}</li>
					{/each}
				</ul>
			</details>
		{:else}
			<p>No tracks in collection yet</p>
		{/if}
	</section>

	<section>
		<h2>Global Collection State</h2>
		<p>Total tracks across all channels: {allTracks?.length ?? 0}</p>
		{#if allTracks && allTracks.length > 0}
			<details>
				<summary>Show all channels in collection</summary>
				<ul>
					{#each [...new Set(allTracks.map((t) => t.channel_slug))] as slug}
						<li>
							{slug}: {allTracks.filter((t) => t.channel_slug === slug).length} tracks
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	<section>
		<h2>Test Instructions</h2>
		<ol>
			<li>Load tracks for "oskar" (default)</li>
			<li>Change slug to "200ok" - see new fetch + collection grows</li>
			<li>Change back to "oskar" - no fetch (cached), but collection still has both channels</li>
			<li>Change limit - triggers refetch, updates collection</li>
			<li>Clear collection - empties global state, but cache remains</li>
		</ol>
	</section>
</div>
