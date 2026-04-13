<script>
	import {getChannelCtx} from '$lib/contexts'
	import MapChannels from '$lib/components/map-channels.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const channel = $derived(channelCtx.data)
	const hasLocation = $derived(channel?.latitude && channel?.longitude)

	let globeMode = $state(false)
	let showGraticules = $state(false)
	let showDayNight = $state(false)
	/** @type {'carto' | 'topo' | 'satellite'} */
	let tileStyle = $state('carto')
</script>

<article class="map-page fill-height">
	<Subpage
		title={m.nav_map()}
		loading={channelCtx.isLoading}
		empty={!hasLocation}
		emptyText={m.map_channel_no_location()}
	>
		<div class="map-fill fill-height">
			{#if channel}
				<MapChannels
					channels={[channel]}
					latitude={channel.latitude}
					longitude={channel.longitude}
					zoom={15}
					syncUrl={true}
					linkToMap="global"
					showControls={true}
					bind:globeMode
					bind:showGraticules
					bind:showDayNight
					bind:tileStyle
				/>
			{/if}
		</div>
	</Subpage>
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
