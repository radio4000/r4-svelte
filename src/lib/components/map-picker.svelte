<script>
	import { untrack } from 'svelte'
	import maplibregl from 'maplibre-gl'
	import * as m from '$lib/paraglide/messages'
	import MapComponent from '$lib/components/map.svelte'

	const {latitude = null, longitude = null, onselect = () => {}} = $props()

	// Capture initial position once — prop changes from picking should not re-fly the map
	const initialLat = untrack(() => latitude)
	const initialLng = untrack(() => longitude)
	const initialZoom = untrack(() => (latitude && longitude ? 10 : 2))

	/** @type {maplibregl.Map | null} */
	let map = null
	/** @type {maplibregl.Marker | null} */
	let selectedMarker = null
	/** @type {{lat: number, lng: number} | null} */
	let selected = $state(null)

	function handleReady(readyMap) {
		map = readyMap
		if (latitude && longitude && !readyMap.getSource('existing-location')) {
			readyMap.addSource('existing-location', {
				type: 'geojson',
				data: {
					type: 'Feature',
					geometry: {type: 'Point', coordinates: [longitude, latitude]},
					properties: {}
				}
			})
			readyMap.addLayer({
				id: 'existing-location-layer',
				type: 'circle',
				source: 'existing-location',
				paint: {
					'circle-radius': 8,
					'circle-color': '#666',
					'circle-stroke-color': '#fff',
					'circle-stroke-width': 2
				}
			})
		}
	}

	function handleClick({lat, lng}) {
		if (!map) return

		if (selectedMarker) {
			selectedMarker.remove()
			selectedMarker = null
		}

		selectedMarker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map)
		selected = {lat, lng}
		onselect({latitude: lat, longitude: lng})
	}

	function clearSelection() {
		if (selectedMarker) {
			selectedMarker.remove()
			selectedMarker = null
		}
		selected = null
		onselect({latitude: null, longitude: null})
	}
</script>

<MapComponent
	latitude={initialLat ?? undefined}
	longitude={initialLng ?? undefined}
	zoom={initialZoom}
	onclick={handleClick}
	onready={handleReady}
/>

{#if selected}
	<button type="button" onclick={clearSelection}>
		{m.common_cancel()}
	</button>
{/if}
