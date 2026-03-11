<script>
	import 'leaflet/dist/leaflet.css'
	import L from 'leaflet'
	import {page} from '$app/state'
	import {replaceState} from '$app/navigation'

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
		return L.tileLayer(tile.url, {
			attribution: tile.attribution,
			noWrap: true
		})
	}

	function setup(node) {
		let disposed = false
		const lat = latitude ?? (syncUrl ? Number(page.url.searchParams.get('latitude')) || 20 : 20)
		const lng = longitude ?? (syncUrl ? Number(page.url.searchParams.get('longitude')) || 0 : 0)
		const z = zoom ?? (syncUrl ? Number(page.url.searchParams.get('zoom')) || 2 : 2)

		const worldBounds = L.latLngBounds(L.latLng(-85.05112878, -180), L.latLng(85.05112878, 180))
		const map = L.map(node, {
			zoomControl: false,
			attributionControl: false,
			doubleClickZoom: false,
			worldCopyJump: false,
			maxBounds: worldBounds,
			maxBoundsViscosity: 1.0
		}).setView([lat, lng], z)
		L.control.zoom({position: 'bottomright'}).addTo(map)
		L.control.attribution({position: 'bottomright'}).addTo(map)
		map.setMaxBounds(worldBounds)
		const worldMinZoom = map.getBoundsZoom(worldBounds, true)
		map.setMinZoom(worldMinZoom)
		if (map.getZoom() < worldMinZoom) map.setZoom(worldMinZoom, {animate: false})
		map.panInsideBounds(worldBounds, {animate: false})

		let tileLayer = createTileLayer().addTo(map)

		if (onclick) {
			map.on('click', (e) => onclick({lat: e.latlng.lat, lng: e.latlng.lng}))
		}

		let debounce
		if (syncUrl) {
			map.on('moveend', () => {
				clearTimeout(debounce)
				debounce = setTimeout(() => {
					if (disposed) return
					if (!map || !map._loaded || !map._mapPane) return
					const {lat, lng} = map.getCenter()
					const z = map.getZoom()
					const url = new URL(page.url.href)
					url.searchParams.set('latitude', lat.toFixed(4))
					url.searchParams.set('longitude', lng.toFixed(4))
					url.searchParams.set('zoom', z)
					replaceState(url, {})
				}, 300)
			})
		}

		map.on('resize', () => {
			const nextWorldMinZoom = map.getBoundsZoom(worldBounds, true)
			map.setMinZoom(nextWorldMinZoom)
			if (map.getZoom() < nextWorldMinZoom) map.setZoom(nextWorldMinZoom, {animate: false})
			map.panInsideBounds(worldBounds, {animate: false})
		})

		onready?.(map)

		const observer = new MutationObserver(() => {
			const next = createTileLayer()
			map.removeLayer(tileLayer)
			next.addTo(map)
			tileLayer = next
			map.panInsideBounds(worldBounds, {animate: false})
		})
		observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']})

		return () => {
			disposed = true
			observer.disconnect()
			clearTimeout(debounce)
			try {
				map.stop()
				map.off()
			} catch {
				// ignore
			}
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

	/* Keep zoom controls above credits in bottom-right corner. */
	.map :global(.leaflet-bottom.leaflet-right) {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.map :global(.leaflet-bottom.leaflet-right .leaflet-control-zoom) {
		order: 1;
	}

	.map :global(.leaflet-bottom.leaflet-right .leaflet-control-attribution) {
		order: 2;
	}
</style>
