<script>
	import {getChannelCtx} from '$lib/contexts'
	import MapChannels from '$lib/components/map-channels.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const channel = $derived(channelCtx.data)
	const hasLocation = $derived(channel?.latitude && channel?.longitude)
</script>

<article class="map-page fill-height">
	<Subpage
		title={m.nav_map()}
		loading={channelCtx.isLoading}
		empty={!hasLocation}
		emptyText={m.map_channel_no_location()}
	>
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
	</Subpage>
</article>

<style>
	.map-page {
		flex-direction: column;
		position: relative;
	}

	header {
		padding: 0.5rem;
	}

	.map-fill {
		display: contents;
	}
</style>
