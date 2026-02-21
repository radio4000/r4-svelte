<script>
	import 'leaflet/dist/leaflet.css'
	import L from 'leaflet'

	let {latitude = null, longitude = null, zoom = null, onclick = null, onready = null, syncUrl = false} = $props()

	const TILES = {
		light: {
			url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
			attribution: '&copy; OpenStreetMap &copy; CARTO'
		},
		dark: {
			url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
			attribution: '&copy; OpenStreetMap &copy; CARTO'
		}
	}

	function isDarkTheme() {
		return document.documentElement.classList.contains('dark')
	}

	function createTileLayer() {
		const tile = isDarkTheme() ? TILES.dark : TILES.light
		return L.tileLayer(tile.url, {attribution: tile.attribution})
	}

	function setup(node) {
		const params = new URLSearchParams(location.search)
		const lat = latitude ?? (syncUrl ? Number(params.get('latitude')) || 20 : 20)
		const lng = longitude ?? (syncUrl ? Number(params.get('longitude')) || 0 : 0)
		const z = zoom ?? (syncUrl ? Number(params.get('zoom')) || 2 : 2)

		const map = L.map(node, {zoomControl: false}).setView([lat, lng], z)
		L.control.zoom({position: 'bottomright'}).addTo(map)

		let tileLayer = createTileLayer().addTo(map)

		if (onclick) {
			map.on('click', (e) => onclick({lat: e.latlng.lat, lng: e.latlng.lng}))
		}

		if (syncUrl) {
			let debounce
			map.on('moveend', () => {
				clearTimeout(debounce)
				debounce = setTimeout(() => {
					const {lat, lng} = map.getCenter()
					const z = map.getZoom()
					const url = new URL(location.href)
					url.searchParams.set('latitude', lat.toFixed(4))
					url.searchParams.set('longitude', lng.toFixed(4))
					url.searchParams.set('zoom', z)
					history.replaceState(null, '', url)
				}, 300)
			})
		}

		onready?.(map)

		const observer = new MutationObserver(() => {
			const next = createTileLayer()
			map.removeLayer(tileLayer)
			next.addTo(map)
			tileLayer = next
		})
		observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']})

		return () => {
			observer.disconnect()
			map.remove()
		}
	}
</script>

<div class="map" {@attach setup}></div>

<style>
	.map {
		width: 100%;
		height: 100%;
		min-height: 300px;
		z-index: 1;
		background: var(--body-bg);
	}

	.map :global(.leaflet-container) {
		background: light-dark(var(--gray-2), var(--gray-12));
	}

	:global(html.dark) .map :global(.leaflet-tile-pane),
	:global(html.dark) .map :global(.leaflet-tile-container),
	:global(html.dark) .map :global(.leaflet-pane) {
		background: var(--gray-12);
	}

	.map :global(.leaflet-tile) {
		background: transparent;
	}

	.map :global(.leaflet-control-zoom a),
	.map :global(.leaflet-control-attribution) {
		background: light-dark(var(--gray-1), var(--gray-3));
		color: light-dark(var(--gray-12), var(--gray-11));
		border-color: light-dark(var(--gray-5), var(--gray-6));
	}
</style>
