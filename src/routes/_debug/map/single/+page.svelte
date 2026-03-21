<script>
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/collections/channels'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import MapChannels from '$lib/components/map-channels.svelte'

	const channelsQuery = useLiveQuery((q) => q.from({ch: channelsCollection}))

	const channelsWithLocation = $derived(
		(channelsQuery.data ?? []).filter(
			(channel) => Number.isFinite(channel?.latitude) && Number.isFinite(channel?.longitude)
		)
	)

	const requestedSlug = $derived((page.url.searchParams.get('slug') || '').toLowerCase())
	const shouldOpen = $derived(page.url.searchParams.get('open') === 'true')
	const selectedChannel = $derived.by(() => {
		if (!channelsWithLocation.length) return null
		if (!requestedSlug) return channelsWithLocation[0]
		return (
			channelsWithLocation.find((channel) => channel.slug?.toLowerCase() === requestedSlug) ||
			channelsWithLocation[0]
		)
	})
	const sampleChannels = $derived(channelsWithLocation.slice(0, 12))
</script>

<svelte:head>
	<title>Debug Map Single</title>
</svelte:head>

<article class="page">
	<header class="toolbar">
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
				Open popup:
				<a href="?slug={selectedChannel.slug}&open=true">true</a>
				·
				<a href="?slug={selectedChannel.slug}&open=false">false</a>
			</p>
			<p>
				Pick channel:
				{#each sampleChannels as channel, i (channel.id)}
					{#if i > 0}
						·
					{/if}
					<a href="?slug={channel.slug}&open={shouldOpen ? 'true' : 'false'}">@{channel.slug}</a>
				{/each}
			</p>
		{/if}
	</header>

	<section class="map-area">
		{#if !channelsQuery.isLoading && selectedChannel}
			<MapChannels
				channels={[selectedChannel]}
				latitude={selectedChannel.latitude}
				longitude={selectedChannel.longitude}
				zoom={15}
				syncUrl={true}
				openSlug={shouldOpen ? selectedChannel.slug : null}
				openRequestKey={page.url.search}
				linkToMap="global"
			/>
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
