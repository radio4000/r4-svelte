<script>
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/collections/channels'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import MapChannels from '$lib/components/map-channels.svelte'

	const channelsQuery = useLiveQuery((q) => q.from({ch: channelsCollection}))

	const openSlug = $derived(page.url.searchParams.get('slug'))
	const channelsWithLocation = $derived(
		(channelsQuery.data ?? []).filter(
			(channel) => Number.isFinite(channel?.latitude) && Number.isFinite(channel?.longitude)
		)
	)
</script>

<svelte:head>
	<title>Debug Map Global</title>
</svelte:head>

<article class="page">
	<header class="toolbar">
		<menu class="nav-grouped">
			<a href="/_debug/map">&larr;</a>
			<a href="/_debug/map/global" aria-current="page">global</a>
			<a href="/_debug/map/single">single</a>
		</menu>
		{#if channelsQuery.isLoading}
			<p>Loading channels…</p>
		{:else if !channelsWithLocation.length}
			<p>No channels with location found.</p>
		{:else}
			<p>{channelsWithLocation.length} channels with location.</p>
		{/if}
	</header>

	<section class="map-area">
		{#if !channelsQuery.isLoading && channelsWithLocation.length}
			<MapChannels channels={channelsWithLocation} {openSlug} syncUrl={true} />
		{/if}
	</section>
</article>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		flex-shrink: 0;
	}

	.toolbar p {
		margin: 0;
	}

	.map-area {
		flex: 1;
		min-height: 0;
	}
</style>
