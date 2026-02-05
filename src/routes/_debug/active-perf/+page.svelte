<script lang="ts">
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {tracksCollection, ensureTracksLoaded} from '$lib/tanstack/collections'
	import {appState} from '$lib/app-state.svelte'
	import TrackCard from '$lib/components/track-card.svelte'

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

	function cycleActive() {
		if (!tracks.length) return
		results = []

		// Measure cycling through 10 random tracks
		const iterations = 10
		const times: number[] = []

		for (let i = 0; i < iterations; i++) {
			const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]
			const start = performance.now()
			appState.playlist_track = randomTrack.id
			const end = performance.now()
			times.push(end - start)
		}

		const avg = times.reduce((a, b) => a + b, 0) / times.length
		results = [
			`Tracks rendered: ${tracks.length}`,
			`Iterations: ${iterations}`,
			`Times: ${times.map((t) => t.toFixed(3)).join(', ')}ms`,
			`Average: ${avg.toFixed(3)}ms`
		]
	}

	function measureDerived() {
		if (!tracks.length) return

		// Direct measurement of 4k comparisons
		const start = performance.now()
		const playlistTrack = appState.playlist_track
		for (const track of tracks) {
			const _ = track.id === playlistTrack
		}
		const end = performance.now()
		results = [...results, `Raw 4k comparisons: ${(end - start).toFixed(3)}ms`]
	}
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>Active Track Performance</h1>
	<p>Test: does comparing track.id === appState.playlist_track for {tracks.length} tracks cause issues?</p>

	<section>
		<label>
			Channel slug:
			<input type="text" bind:value={slug} />
		</label>
		<button onclick={loadTracks} disabled={loading}>
			{loading ? 'Loading...' : `Load tracks (${tracks.length} loaded)`}
		</button>
	</section>

	<section>
		<button onclick={cycleActive} disabled={!tracks.length}>Cycle active track (10x)</button>
		<button onclick={measureDerived} disabled={!tracks.length}>Measure raw comparisons</button>
		{#if results.length}
			<pre>{results.join('\n')}</pre>
		{/if}
	</section>

	<section>
		<h2>Tracklist ({tracks.length} items)</h2>
		<p>Current active: <code>{appState.playlist_track}</code></p>
		<ul class="list tracks">
			{#each tracks as track, index (track.id)}
				<li>
					<TrackCard {track} {index} />
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	section {
		margin-block: var(--space-4);
	}
</style>
