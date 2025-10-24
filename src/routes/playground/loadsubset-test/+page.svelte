<script>
	import { useLiveQuery } from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte.js'
	import { createLoadSubsetCollection } from '$lib/tanstack/load-subset-collection.js'
	import { useChannelTracks } from '$lib/hooks/useChannelTracks.svelte.js'
	import { trackSchema } from '$lib/schemas'
	import { r5 } from '$lib/r5'
	import { eq } from '@tanstack/db'

	// Create collection with loadSubset behavior
	const tracksCollection = createLoadSubsetCollection({
		id: 'tracks-loadsubset',
		getKey: (t) => t.id,
		schema: trackSchema,
		fetchSubset: async ({ slug, limit }) => {
			console.log(`📥 Fetching tracks for ${slug} (limit: ${limit})`)
			const tracks = await r5.tracks.r4({ slug, limit })
			// Denormalize: add channel_slug to each track
			return tracks.map(t => ({ ...t, channel_slug: slug }))
		},
		ttl: 5 * 60 * 1000
	})

	let currentSlug = $state('ko002')

	// SCENARIO 1: Hook-based
	const ko002Result = useChannelTracks(currentSlug, {
		collection: tracksCollection,
		limit: 20
	})

	// SCENARIO 2: Manual loadSubset + Live Query
	let manualSlug = $state('detecteve')
	let manualLoading = $state(false)

	async function loadChannel(slug) {
		manualLoading = true
		manualSlug = slug // Update slug to match what we're loading
		try {
			const where = { type: 'eq', left: { path: ['channel_slug'] }, right: { value: slug } }
			console.log('Loading subset for:', slug)
			await tracksCollection.loadSubset({ where, limit: 10 })
			console.log('Loaded. Collection now has:', tracksCollection.toArray.length, 'tracks')
			console.log('Tracks for', slug, ':', tracksCollection.toArray.filter(t => t.channel_slug === slug).length)
		} catch (err) {
			console.error('Load failed:', err)
		} finally {
			manualLoading = false
		}
	}

	const manualTracks = useLiveQuery((q) =>
		q
			.from({ t: tracksCollection })
			.where(({ t }) => eq(t.channel_slug, manualSlug))
			.orderBy(({ t }) => t.created_at, 'desc')
			.limit(10)
	)

	$effect(() => {
		console.log('manualTracks.data:', manualTracks.data?.length, 'for slug:', manualSlug)
		console.log('manualTracks.status:', manualTracks.status)
		console.log('Collection total:', tracksCollection.toArray.length)
		if (manualTracks.data) {
			console.log('Query returned:', manualTracks.data)
		}
	})
</script>

<h1>LoadSubset Pattern Test</h1>

<section>
	<h2>1. Hook-based (useChannelTracks)</h2>
	<p>currentSlug: {currentSlug}</p>
	<p>isLoading: {ko002Result.isLoading}</p>
	<p>tracks: {ko002Result.tracks?.length ?? 0}</p>
</section>

<section>
	<h2>2. Manual loadSubset</h2>
	<button onclick={() => loadChannel('detecteve')}>Load detecteve</button>
	<button onclick={() => loadChannel('manfredas')}>Load manfredas</button>
	{#if manualLoading}
		<span>Loading...</span>
	{/if}
	<p>Current: {manualSlug}</p>
	<p>manualTracks: {manualTracks.data?.length ?? 0}</p>
</section>
