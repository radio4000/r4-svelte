<!--
The one MapLibre wrapper (init/resize/theme/URL sync); map-picker and map-channels
compose it via props. Non-reactive map logic lives in map-markers.js, map-tile-styles.js,
map-overlays.js, map-color.js - extend those rather than inlining here.
map-broadcast-layer.js is an independent WebGL layer, coupled only via map-color.js.
-->
<script>
	import 'maplibre-gl/dist/maplibre-gl.css'
	import * as maplibregl from 'maplibre-gl'
	// MapLibre 6 is ESM-only and resolves its worker as `new URL('./maplibre-gl-worker.mjs',
	// import.meta.url)`. Once Vite bundles maplibre into a hashed chunk that sibling file
	// doesn't exist, the worker 404s and every GeoJSON source hangs forever (no markers, no
	// overlays) without throwing. `?worker&url` makes Vite emit the worker as its own bundle.
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {buildOsmStyle, isDarkTheme} from './map-tile-styles.js'

	maplibregl.setWorkerUrl(maplibreWorkerUrl)

	let {
		latitude = null,
		longitude = null,
		zoom = null,
		onclick = null,
		onready = null,
		syncUrl = false,
		projection = 'mercator'
	} = $props()

	function setup(node) {
		let disposed = false
		/** @type {maplibregl.Map | null} */
		let map = null
		let debounce
		/** @type {MutationObserver | null} */
		let themeObserver = null
		/** @type {ResizeObserver | null} */
		let resizeObserver = null
		let resizeFrame = 0

		const lat = latitude ?? (syncUrl ? Number(page.url.searchParams.get('latitude')) || 20 : 20)
		const lng = longitude ?? (syncUrl ? Number(page.url.searchParams.get('longitude')) || 0 : 0)
		const z = zoom ?? (syncUrl ? Number(page.url.searchParams.get('zoom')) || 2 : 2)

		function initMap() {
			if (disposed || map) return

			map = new maplibregl.Map({
				container: node,
				style: buildOsmStyle(isDarkTheme()),
				center: [lng, lat],
				zoom: z,
				doubleClickZoom: false,
				attributionControl: false
			})

			map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'bottom-right')
			map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right')

			const m = map
			function resizeMap() {
				if (disposed || !map) return
				cancelAnimationFrame(resizeFrame)
				resizeFrame = requestAnimationFrame(() => {
					if (!disposed) map?.resize()
				})
			}

			resizeObserver = new ResizeObserver(resizeMap)
			resizeObserver.observe(node)
			resizeMap()

			m.on('load', () => {
				if (disposed) return
				m.setProjection({type: projection})
				m.resize()
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
						goto(
							page.route.id
								? resolve(/** @type {any} */ (page.route.id), page.params) + queryString
								: page.url.pathname + queryString,
							{shallow: true, replace: true}
						)
					}, 300)
				})
			}

			themeObserver = new MutationObserver(() => {
				if (disposed || !map) return
				const nextStyle = buildOsmStyle(isDarkTheme())
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
			resizeObserver?.disconnect()
			cancelAnimationFrame(resizeFrame)
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
		gap: var(--space-1);
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
