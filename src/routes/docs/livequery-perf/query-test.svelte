<script lang="ts">
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {tracksCollection} from '$lib/collections/tracks'

	interface Props {
		slug: string
	}

	let {slug}: Props = $props()

	// Use the instrumented useLiveQuery
	const tracksQuery = useLiveQuery(
		(q) =>
			q
				.from({tracks: tracksCollection})
				.where(({tracks}) => eq(tracks.slug, slug))
				.orderBy(({tracks}) => tracks.created_at, 'desc'),
		[() => slug]
	)
</script>

<div class="query-test">
	<h3>Query Status</h3>
	<table>
		<tbody>
			<tr>
				<td>Status:</td>
				<td><code>{tracksQuery.status}</code></td>
			</tr>
			<tr>
				<td>isLoading:</td>
				<td><code>{tracksQuery.isLoading}</code></td>
			</tr>
			<tr>
				<td>isReady:</td>
				<td><code>{tracksQuery.isReady}</code></td>
			</tr>
			<tr>
				<td>Track count:</td>
				<td><code>{tracksQuery.data?.length ?? 0}</code></td>
			</tr>
		</tbody>
	</table>

	{#if tracksQuery.isLoading}
		<p>Loading...</p>
	{:else if tracksQuery.isReady && tracksQuery.data}
		<h3>First 5 tracks</h3>
		<ul>
			{#each tracksQuery.data.slice(0, 5) as track (track.id)}
				<li>{track.title}</li>
			{/each}
		</ul>
		{#if tracksQuery.data.length > 5}
			<p><em>... and {tracksQuery.data.length - 5} more</em></p>
		{/if}
	{/if}
</div>

<style>
	.query-test {
		background: #0a0a0a;
		padding: 1rem;
		border-radius: 4px;
	}
	td {
		padding: 0.25rem 1rem 0.25rem 0;
	}
</style>
