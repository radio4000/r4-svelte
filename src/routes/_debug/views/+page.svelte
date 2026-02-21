<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {parseView, serializeView, queryViewTracks} from '$lib/views.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ViewsBar from '$lib/components/views-bar.svelte'

	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.search)
	const viewQuery = queryViewTracks(() => view)

	function onchange(v: import('$lib/views.svelte').View) {
		goto(`/_debug/views?${serializeView(v)}`, {replaceState: true})
	}
</script>

<svelte:head>
	<title>Views</title>
</svelte:head>

<article class="container">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<header>
		<h1>Views</h1>
	</header>

	<ViewsBar {view} {onchange} />
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a search to start.</p>
	{:else if viewQuery.loading}
		<p>Loading tracks…</p>
	{:else if viewQuery.tracks.length}
		<p>{viewQuery.tracks.length} tracks</p>
	{/if}
</div>

{#if viewQuery.tracks.length}
	<Tracklist tracks={viewQuery.tracks} />
{/if}

<style>
	article {
		margin-block-end: 1rem;
	}
	header {
		margin-block: 0.5rem 1rem;
	}
</style>
