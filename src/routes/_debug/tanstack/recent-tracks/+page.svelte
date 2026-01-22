<script lang="ts">
	import Menu from '../menu.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {tracksCollection, queryClient} from '$lib/tanstack/collections'

	/**
	 * Cross-collection query demo
	 *
	 * This proves TanStack DB's value over Query alone:
	 * - Query caches data in separate blobs: ['tracks', 'starttv'], ['tracks', 'blink']
	 * - You can't query across those blobs with Query
	 * - DB's collection lets you query ALL in-memory tracks with SQL-like syntax
	 *
	 * Visit several channels first to load their tracks, then see them all here.
	 */

	// Query the 50 most recent tracks across ALL loaded channels
	const recentTracks = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.orderBy(({tracks}) => tracks.created_at, 'desc')
			.limit(50)
	)

	// Stats about what's loaded
	const slugsLoaded = $derived(() => {
		const slugs: Record<string, true> = {}
		for (const track of tracksCollection.state.values()) {
			if (track.slug) {
				slugs[track.slug] = true
			}
		}
		return Object.keys(slugs).sort()
	})

	const cacheKeys = $derived(
		queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === 'tracks')
			.map((q) => q.queryKey.join('/'))
	)
</script>

<div class="constrained">
	<Menu />
	<h1>Recent Tracks (cross-collection)</h1>

	<p>
		This queries the 50 most recent tracks <strong>across all loaded channels</strong> — something Query cache blobs can't
		do.
	</p>

	<section>
		<h2>What's loaded</h2>
		<p>Collection: {tracksCollection.state.size} tracks from {slugsLoaded().length} channels</p>
		<p>Cache keys: {cacheKeys.length ? cacheKeys.join(', ') : 'none'}</p>
		{#if slugsLoaded().length === 0}
			<p><em>Visit some channel pages first to load tracks into memory.</em></p>
		{/if}
	</section>

	{#if recentTracks.data?.length}
		<section>
			<h2>50 most recent tracks (any channel)</h2>
			<table>
				<thead>
					<tr><th>Channel</th><th>Title</th><th>Created</th></tr>
				</thead>
				<tbody>
					{#each recentTracks.data as track (track.id)}
						<tr>
							<td><a href="/{track.slug}">{track.slug}</a></td>
							<td>{track.title}</td>
							<td>{track.created_at ? new Date(track.created_at).toLocaleDateString() : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{:else if recentTracks.isLoading}
		<p>Loading...</p>
	{:else}
		<p>No tracks loaded yet.</p>
	{/if}
</div>
