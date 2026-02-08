<script>
	import L from 'leaflet'
	import {mount, unmount, onDestroy} from 'svelte'
	import MapComponent from './map.svelte'
	import ChannelCard from './channel-card.svelte'

	const {
		channels = [],
		latitude = null,
		longitude = null,
		zoom = null,
		syncUrl = true,
		openSlug = null,
		linkToMap = true
	} = $props()

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
				const mapHref =
					linkToMap === 'global'
						? `/?display=map&slug=${c.slug}&longitude=${c.longitude}&latitude=${c.latitude}&zoom=15`
						: linkToMap
							? `/${c.slug}/map`
							: null
				const popup = document.createElement('div')
				popup.className = 'map-popup'
				const card = mount(ChannelCard, {
					target: popup,
					props: {channel: c, href: mapHref ?? undefined}
				})
				mountedPopups.push(card)

				const marker = L.circleMarker([c.latitude, c.longitude], {
					radius: 6,
					color: '#fff',
					weight: 2,
					fillColor: '#666',
					fillOpacity: 1
				})
					.bindPopup(popup)
					.addTo(markersLayer)

				if (openSlug && c.slug === openSlug) {
					marker.openPopup()
				}
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

<div class="map-root">
	<MapComponent onready={handleReady} {latitude} {longitude} {zoom} {syncUrl} />
</div>

<style>
	.map-root {
		display: flex;
		flex: 1;
		min-height: 0;
		height: 100%;
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
