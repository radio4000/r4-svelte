<script>
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
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

<article class="fill-height">
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
		<div class="fill-height">
			<MapChannels channels={channelsWithLocation} {openSlug} syncUrl={true} />
		</div>
	{/if}
</article>
