<script>
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import MapChannels from '$lib/components/map-channels.svelte'

	const channelsQuery = useLiveQuery((q) => q.from({ch: channelsCollection}))

	const channelsWithLocation = $derived(
		(channelsQuery.data ?? []).filter(
			(channel) => Number.isFinite(channel?.latitude) && Number.isFinite(channel?.longitude)
		)
	)

	const requestedSlug = $derived((page.url.searchParams.get('slug') || '').toLowerCase())
	const selectedChannel = $derived.by(() => {
		if (!channelsWithLocation.length) return null
		if (!requestedSlug) return channelsWithLocation[0]
		return (
			channelsWithLocation.find((channel) => channel.slug?.toLowerCase() === requestedSlug) || channelsWithLocation[0]
		)
	})
	const sampleChannels = $derived(channelsWithLocation.slice(0, 12))
</script>

<svelte:head>
	<title>Debug Map Single</title>
</svelte:head>

<article class="fill-height">
	<menu class="nav-grouped">
		<a href="/_debug/map">&larr;</a>
		<a href="/_debug/map/global">global</a>
		<a href="/_debug/map/single" aria-current="page">single</a>
	</menu>

	{#if channelsQuery.isLoading}
		<p>Loading channels…</p>
	{:else if !selectedChannel}
		<p>No channels with location found.</p>
	{:else}
		<p>
			Selected: <a href="/{selectedChannel.slug}">@{selectedChannel.slug}</a>
		</p>
		<p>
			Pick channel:
			{#each sampleChannels as channel, i (channel.id)}
				{#if i > 0}
					·
				{/if}
				<a href="?slug={channel.slug}">@{channel.slug}</a>
			{/each}
		</p>
		<div class="fill-height">
			<MapChannels
				channels={[selectedChannel]}
				latitude={selectedChannel.latitude}
				longitude={selectedChannel.longitude}
				zoom={15}
				syncUrl={true}
				openSlug={selectedChannel.slug}
				linkToMap="global"
			/>
		</div>
	{/if}
</article>
