<script>
	import {getChannelCtx} from '$lib/contexts'
	import MapChannels from '$lib/components/map-channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const channel = $derived(channelCtx.data)
	const hasLocation = $derived(channel?.latitude && channel?.longitude)
</script>

<article class="map-page fill-height">
	{#if channelCtx.isLoading}
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
		display: contents;
	}
</style>
