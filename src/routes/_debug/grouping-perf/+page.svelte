<script lang="ts">
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {tracksCollection, ensureTracksLoaded} from '$lib/tanstack/collections'

	let slug = $state('oskar')
	let loading = $state(false)
	let results = $state<string[]>([])

	const tracksQuery = useLiveQuery(
		(q) =>
			q
				.from({tracks: tracksCollection})
				.where(({tracks}) => eq(tracks.slug, slug))
				.orderBy(({tracks}) => tracks.created_at, 'desc'),
		[() => slug]
	)

	const tracks = $derived(tracksQuery.data ?? [])

	async function loadTracks() {
		loading = true
		await ensureTracksLoaded(slug)
		loading = false
	}

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	]

	function measureCurrent() {
		if (!tracks.length) return
		const start = performance.now()

		const groups = new Map()
		for (const track of tracks) {
			const date = new Date(track.created_at)
			const year = date.getFullYear().toString()
			const month = date.toLocaleString('en', {month: 'long'})

			let yearGroup = groups.get(year)
			if (!yearGroup) {
				yearGroup = new Map()
				groups.set(year, yearGroup)
			}
			let monthTracks = yearGroup.get(month)
			if (!monthTracks) {
				monthTracks = []
				yearGroup.set(month, monthTracks)
			}
			monthTracks.push(track)
		}

		const end = performance.now()
		results = [...results, `Current (Date + toLocaleString): ${(end - start).toFixed(2)}ms for ${tracks.length} tracks`]
	}

	function measureOptimized() {
		if (!tracks.length) return
		const start = performance.now()

		const groups = new Map()
		for (const track of tracks) {
			// Extract from ISO string directly: "2024-01-15T10:30:00Z"
			const iso = typeof track.created_at === 'string' ? track.created_at : new Date(track.created_at).toISOString()
			const year = iso.slice(0, 4)
			const monthIndex = parseInt(iso.slice(5, 7), 10) - 1
			const month = MONTHS[monthIndex]

			let yearGroup = groups.get(year)
			if (!yearGroup) {
				yearGroup = new Map()
				groups.set(year, yearGroup)
			}
			let monthTracks = yearGroup.get(month)
			if (!monthTracks) {
				monthTracks = []
				yearGroup.set(month, monthTracks)
			}
			monthTracks.push(track)
		}

		const end = performance.now()
		results = [...results, `Optimized (string slice): ${(end - start).toFixed(2)}ms for ${tracks.length} tracks`]
	}

	function measureIndexOf() {
		if (!tracks.length) return
		const start = performance.now()

		// Simulate what line 127 does: tracks.indexOf(track) for each track
		for (const track of tracks) {
			const _ = tracks.indexOf(track)
		}

		const end = performance.now()
		results = [...results, `indexOf O(n²): ${(end - start).toFixed(2)}ms for ${tracks.length} tracks`]
	}

	function clearResults() {
		results = []
	}
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>Grouping Performance</h1>
	<p>Test date parsing and indexOf performance in tracklist grouping.</p>

	<section>
		<label>
			Channel slug:
			<input type="text" bind:value={slug} />
		</label>
		<button onclick={loadTracks} disabled={loading}>
			{loading ? 'Loading...' : 'Load tracks'}
		</button>
		<p>
			<strong>{tracks.length}</strong> tracks loaded {#if tracks[0]}- first: {tracks[0].title}{/if}
		</p>
	</section>

	<section>
		<menu>
			<button onclick={measureCurrent} disabled={!tracks.length}>Current (Date + toLocaleString)</button>
			<button onclick={measureOptimized} disabled={!tracks.length}>Optimized (string slice)</button>
			<button onclick={measureIndexOf} disabled={!tracks.length}>indexOf O(n²)</button>
			<button onclick={clearResults}>Clear</button>
		</menu>
		{#if results.length}
			<pre>{results.join('\n')}</pre>
		{/if}
	</section>
</div>

<style>
	section {
		margin-block: var(--space-4);
	}
</style>
