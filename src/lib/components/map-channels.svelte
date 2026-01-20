<script>
	import L from 'leaflet'
	import {base} from '$app/paths'
	import {shufflePlayChannel} from '$lib/api'
	import MapComponent from './map.svelte'

	const {channels = []} = $props()

	let map = null
	let markersLayer = null

	function handleReady(m) {
		map = m
		markersLayer = L.layerGroup().addTo(map)
		updateMarkers()
	}

	function updateMarkers() {
		if (!markersLayer) return
		markersLayer.clearLayers()

		for (const c of channels) {
			if (c.latitude && c.longitude) {
				const popup = document.createElement('div')
				const link = document.createElement('a')
				link.href = `${base}/${c.slug}`
				link.textContent = c.name || c.slug
				popup.appendChild(link)

				const playBtn = document.createElement('button')
				playBtn.textContent = '▶'
				playBtn.onclick = () => shufflePlayChannel({id: c.id, slug: c.slug})
				popup.appendChild(playBtn)

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
</script>

<div>
	<MapComponent onready={handleReady} syncUrl />
</div>

<style>
	div {
		flex: 1;
	}
</style>
