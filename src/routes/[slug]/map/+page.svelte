<script>
	import {getChannelCtx} from '$lib/contexts'
	import MapChannels from '$lib/components/map-channels.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import Icon from '$lib/components/icon.svelte'
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

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	<menu class="nav-grouped">
		<button
			type="button"
			class:active={globeMode}
			onclick={() => (globeMode = !globeMode)}
			title={globeMode ? m.map_switch_to_flat() : m.map_switch_to_globe()}
		>
			<Icon icon={globeMode ? 'map' : 'globe'} />
		</button>
		<span class="sep"></span>
		<button
			type="button"
			class:active={showGraticules}
			onclick={() => (showGraticules = !showGraticules)}
			title={m.map_toggle_graticules()}
		>
			<Icon icon="grid" />
		</button>
		<button
			type="button"
			class:active={showDayNight}
			onclick={() => (showDayNight = !showDayNight)}
			title={m.map_toggle_day_night()}
		>
			<Icon icon="sun" />
		</button>
		<span class="sep"></span>
		<select bind:value={tileStyle} title={m.map_tiles_label()} aria-label={m.map_tiles_label()}>
			<option value="carto">{m.map_tiles_map()}</option>
			<option value="topo">{m.map_tiles_topo()}</option>
			<option value="satellite">{m.map_tiles_satellite()}</option>
		</select>
	</menu>
{/snippet}

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
					showControls={false}
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

	/* override global nav-grouped margin and extend to buttons/select/sep */
	menu.nav-grouped {
		margin: 0;
		align-items: stretch;

		button,
		select {
			display: inline-flex;
			align-items: center;
			padding: 0.3rem 0.5rem;
			min-height: 2rem;
			font-size: var(--font-4);
			border: none;
			border-right: 1px solid var(--gray-6);
			border-radius: 0;
			background: transparent;
			cursor: pointer;
			&:last-child {
				border-right: none;
			}
			&:hover {
				background: var(--gray-4);
			}
			&.active {
				background: var(--accent-3);
				color: var(--accent-11);
			}
		}

		.sep {
			width: 1px;
			background: var(--gray-6);
			align-self: stretch;
		}
	}
</style>
