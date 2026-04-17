<script>
	import 'maplibre-gl/dist/maplibre-gl.css'
	import maplibregl from 'maplibre-gl'
	import {replaceState} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	/** @import { StyleSpecification } from 'maplibre-gl' */

	let {
		latitude = null,
		longitude = null,
		zoom = null,
		onclick = null,
		onready = null,
		syncUrl = false,
		projection = 'mercator'
	} = $props()

	const TILE_URLS = {
		light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
		dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
	}

	function isDarkTheme() {
		return document.documentElement.classList.contains('dark')
	}

	/** @returns {StyleSpecification} */
	function buildStyle(dark = false) {
		const url = dark ? TILE_URLS.dark : TILE_URLS.light
		return {
			version: 8,
			sources: {
				carto: {
					type: 'raster',
					tiles: [url.replace('{s}', 'a'), url.replace('{s}', 'b'), url.replace('{s}', 'c')],
					tileSize: 256,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
				}
			},
			layers: [{id: 'carto', type: 'raster', source: 'carto'}]
		}
	}

	function setup(node) {
		let disposed = false
		/** @type {maplibregl.Map | null} */
		let map = null
		let debounce
		let themeObserver = null

		const lat = latitude ?? (syncUrl ? Number(page.url.searchParams.get('latitude')) || 20 : 20)
		const lng = longitude ?? (syncUrl ? Number(page.url.searchParams.get('longitude')) || 0 : 0)
		const z = zoom ?? (syncUrl ? Number(page.url.searchParams.get('zoom')) || 2 : 2)

		function initMap() {
			if (disposed || map) return

			map = new maplibregl.Map({
				container: node,
				style: buildStyle(isDarkTheme()),
				center: [lng, lat],
				zoom: z,
				doubleClickZoom: false,
				attributionControl: false
			})

			map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'bottom-right')
			map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right')

			const m = map
			m.on('load', () => {
				if (disposed) return
				m.setProjection({type: projection})
				onready?.(m)
			})

			if (onclick) {
				map.on('click', (e) => onclick({lat: e.lngLat.lat, lng: e.lngLat.lng}))
			}

			if (syncUrl) {
				map.on('moveend', () => {
					clearTimeout(debounce)
					debounce = setTimeout(() => {
						if (disposed || !map) return
						const {lat, lng} = map.getCenter()
						const z = map.getZoom()
						const searchParams = new SvelteURLSearchParams(page.url.search)
						searchParams.set('latitude', lat.toFixed(4))
						searchParams.set('longitude', lng.toFixed(4))
						searchParams.set('zoom', String(z))
						const queryString = searchParams.size ? `?${searchParams}` : ''
						replaceState(
							page.route.id
								? resolve(/** @type {any} */ (page.route.id), page.params) + queryString
								: page.url.pathname + queryString,
							{}
						)
					}, 300)
				})
			}

			themeObserver = new MutationObserver(() => {
				if (disposed || !map) return
				const nextStyle = buildStyle(isDarkTheme())
				map.setStyle(nextStyle)
				// setStyle wipes all user-added sources/layers; re-notify once the new style is loaded
				map.once('styledata', () => {
					if (!disposed) onready?.(map)
				})
			})
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			})
		}

		initMap()

		return () => {
			disposed = true
			themeObserver?.disconnect()
			clearTimeout(debounce)
			map?.remove()
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
		background: transparent;
	}

	.map :global(.maplibregl-map),
	.map :global(.maplibregl-canvas-container) {
		background: transparent;
	}

	.map :global(.maplibregl-canvas) {
		height: 100% !important;
	}

	.map :global(.maplibregl-ctrl button),
	.map :global(.maplibregl-ctrl-attrib) {
		background: light-dark(var(--gray-1), var(--gray-3));
		color: light-dark(var(--gray-12), var(--gray-11));
	}

	.map :global(.maplibregl-ctrl-group) {
		/* Override MapLibre's hardcoded background:#fff */
		background: light-dark(var(--gray-1), var(--gray-3));
		border: 1px solid light-dark(var(--gray-5), var(--gray-6));
		border-radius: var(--border-radius);
		overflow: hidden;
	}

	.map :global(.maplibregl-ctrl-group button) {
		border-color: light-dark(var(--gray-5), var(--gray-6));
	}

	/* Zoom +/− and close icons are SVG background-images with hardcoded dark fill.
	   Invert them in dark mode so they're visible on the dark control background. */
	:global(html.dark) .map :global(.maplibregl-ctrl-icon) {
		filter: invert(1);
	}

	.map :global(.maplibregl-ctrl-attrib) {
		border: 1px solid light-dark(var(--gray-5), var(--gray-6));
		border-radius: var(--border-radius);
	}

	.map :global(.maplibregl-ctrl-attrib a) {
		color: light-dark(var(--gray-11), var(--gray-9));
	}

	/* Hide the MapLibre logo — attribution is shown via our AttributionControl. */
	.map :global(.maplibregl-ctrl-logo) {
		display: none;
	}

	/* Keep zoom above attribution in bottom-right corner. */
	.map :global(.maplibregl-ctrl-bottom-right) {
		right: 0.5rem;
		bottom: 0.5rem;
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.map :global(.maplibregl-ctrl-bottom-right .maplibregl-ctrl),
	.map :global(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
		margin: 0;
	}

	.map :global(.maplibregl-map),
	.map :global(.map-popup) {
		font-family: inherit;
	}
</style>
