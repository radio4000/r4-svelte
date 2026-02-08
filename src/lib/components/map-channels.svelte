<script>
	import L from 'leaflet'
	import {mount, unmount, onDestroy} from 'svelte'
	import MapComponent from './map.svelte'
	import ChannelCard from './channel-card.svelte'

	const {channels = []} = $props()

	let map = null
	let markersLayer = null
	let mountedPopups = []

	function handleReady(m) {
		map = m
		markersLayer = L.layerGroup().addTo(map)
		updateMarkers()
	}

	function updateMarkers() {
		if (!markersLayer) return
		for (const mounted of mountedPopups) {
			void unmount(mounted)
		}
		mountedPopups = []
		markersLayer.clearLayers()

		for (const c of channels) {
			if (c.latitude && c.longitude) {
				const popup = document.createElement('div')
				popup.className = 'map-popup'
				const card = mount(ChannelCard, {
					target: popup,
					props: {channel: c}
				})
				mountedPopups.push(card)

				L.circleMarker([c.latitude, c.longitude], {
					radius: 6,
					color: '#fff',
					weight: 2,
					fillColor: '#666',
					fillOpacity: 1
				})
					.bindPopup(popup)
					.addTo(markersLayer)
			}
		}
	}

	$effect(() => {
		if (channels) updateMarkers()
	})

	onDestroy(() => {
		for (const mounted of mountedPopups) {
			void unmount(mounted)
		}
		mountedPopups = []
	})
</script>

<div>
	<MapComponent onready={handleReady} syncUrl />
</div>

<style>
	div {
		flex: 1;
	}

	:global(.map-popup) {
		width: 12rem;
	}

	:global(.map-popup h3) {
		font-size: var(--font-3);
	}

	:global(.map-popup p) {
		font-size: var(--font-2);
	}

	:global(.map-popup article h3 + p) {
		display: none;
	}
</style>
