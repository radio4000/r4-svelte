<script>
	import {page} from '$app/state'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import MapChannels from '$lib/components/map-channels.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const slug = $derived(page.params.slug)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({ch: channelsCollection})
			.where(({ch}) => eq(ch.slug, slug))
			.findOne()
	)

	const channel = $derived(channelQuery.data)
	const hasLocation = $derived(channel?.latitude && channel?.longitude)
</script>

<article class="map-page fill-height">
	{#if channelQuery.isLoading}
		<p>{m.common_loading()}</p>
	{:else if !channel}
		<p>{m.channel_not_found()}</p>
	{:else if !hasLocation}
		<p>Channel has no location.</p>
	{:else}
		<div class="map-fill fill-height">
			<MapChannels
				channels={[channel]}
				latitude={channel.latitude}
				longitude={channel.longitude}
				zoom={15}
				syncUrl={true}
				openSlug={channel.slug}
				linkToMap="global"
			/>
		</div>
	{/if}
</article>

<style>
	.map-page {
		flex-direction: column;
		position: relative;
	}

	.map-fill {
	}
</style>
