<script>
	import L from 'leaflet'
	import {goto} from '$app/navigation'
	import {base} from '$app/paths'
	import {page} from '$app/state'

	const {
		mapId = Date.now().toString(),
		markers = [],
		latitude = 0,
		longitude = 0,
		zoom = 10,
		selectMode = false,
		urlMode = false,
		onmapclick = null,
		onmapchange = null
	} = $props()

	/** @type {{instance: L.Map | null, markerGroup: L.FeatureGroup | null, markerInstances: Map<string, L.Marker>, newMarker: L.Marker | null, debounceTimer: ReturnType<typeof setTimeout> | null, isInitialized: boolean, isProgrammaticChange: boolean}} */
	let mapState = $state({
		instance: null,
		markerGroup: null,
		markerInstances: new Map(),
		newMarker: null,
		debounceTimer: null,
		isInitialized: false,
		isProgrammaticChange: false
	})

	// Derive only the valid markers
	const validMarkers = $derived(markers.filter((m) => m.latitude && m.longitude && m.title))

	function getCssVar(name) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
	}

	function createIcon(color) {
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">` +
			`<circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>` +
			`</svg>`
		return L.icon({
			iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
			iconSize: [24, 24],
			iconAnchor: [12, 12]
		})
	}

	/** @param {HTMLElement} node */
	function setup(node) {
		const fillNew = getCssVar('--color-accent')

		const map = L.map(node)
		mapState.instance = map

		if (urlMode || onmapchange) {
			map.on('moveend', handleChange)
			map.on('zoomend', handleChange)
		}

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			className: 'Map-tiles'
		}).addTo(map)

		// Create an empty feature group container
		mapState.markerGroup = L.featureGroup().addTo(map)

		// Click-to-select marker logic
		if (selectMode && onmapclick) {
			map.on('click', (e) => {
				const {lat: latitude, lng: longitude} = e.latlng
				onmapclick({latitude, longitude})
				if (mapState.newMarker) map.removeLayer(mapState.newMarker)
				mapState.newMarker = L.marker([latitude, longitude], {
					icon: createIcon(fillNew),
					title: 'New Position'
				})
					.addTo(map)
					.bindPopup(`${latitude}, ${longitude}`)
					.openPopup()
			})
		}

		// Set initial view without triggering events
		mapState.isProgrammaticChange = true
		map.setView([latitude || 0, longitude || 0], zoom)

		// Mark as initialized after initial view is set
		setTimeout(() => {
			mapState.isInitialized = true
			mapState.isProgrammaticChange = false
		}, 200)

		return {
			destroy() {
				map.remove()
				// Clear any pending debounced calls
				if (mapState.debounceTimer) {
					clearTimeout(mapState.debounceTimer)
				}
			}
		}
	}

	function handleChange() {
		// Skip if not initialized or if change is programmatic
		if (!mapState.isInitialized || mapState.isProgrammaticChange) return

		if (mapState.debounceTimer) clearTimeout(mapState.debounceTimer)
		mapState.debounceTimer = setTimeout(() => {
			if (!mapState.instance) return
			const {lat, lng} = mapState.instance.getCenter()
			const newZoom = mapState.instance.getZoom()
			if (onmapchange) {
				onmapchange({
					latitude: lat.toFixed(5),
					longitude: lng.toFixed(5),
					zoom: newZoom
				})
			} else if (urlMode) {
				// Fallback to URL update if no callback provided
				let query = new URL(page.url).searchParams
				query.set('latitude', lat.toFixed(5))
				query.set('longitude', lng.toFixed(5))
				query.set('zoom', newZoom)
				goto(`?${query.toString()}`)
			}
		}, 500)
	}

	const markerFill = $derived(getCssVar('--gray-12'))

	// Update markers with efficient diffing
	$effect(() => {
		if (!mapState.instance || !mapState.markerGroup) return

		const currentIds = new Set(validMarkers.map((m) => `${m.latitude}-${m.longitude}-${m.title}`))
		const existingIds = new Set(mapState.markerInstances.keys())

		// Remove markers that no longer exist
		for (const id of existingIds) {
			if (!currentIds.has(id)) {
				mapState.markerGroup.removeLayer(mapState.markerInstances.get(id))
				mapState.markerInstances.delete(id)
			}
		}

		let activeMarker = null
		// Add or update markers
		for (const markerData of validMarkers) {
			const {latitude, longitude, title, href, isActive} = markerData
			const id = `${latitude}-${longitude}-${title}`

			if (!mapState.markerInstances.has(id)) {
				const popup = href ? `<a href="${base}/${href}">${title}</a>` : title
				const marker = L.marker([latitude, longitude], {icon: createIcon(markerFill), title})
					.addTo(mapState.markerGroup)
					.bindPopup(popup)
				mapState.markerInstances.set(id, marker)

				if (isActive) {
					activeMarker = {marker, data: markerData}
				}
			}
		}

		// Handle active marker and view positioning
		if (activeMarker) {
			setTimeout(() => activeMarker.marker.openPopup(), 100)
			mapState.isProgrammaticChange = true
			mapState.instance.setView([activeMarker.data.latitude, activeMarker.data.longitude], zoom)
			setTimeout(() => {
				mapState.isProgrammaticChange = false
			}, 100)
		} else if (validMarkers.length === 1) {
			const {latitude, longitude} = validMarkers[0]
			mapState.isProgrammaticChange = true
			mapState.instance.setView([latitude, longitude], zoom)
			setTimeout(() => {
				mapState.isProgrammaticChange = false
			}, 100)
		} else if (validMarkers.length > 1 && !page?.url?.searchParams?.get('zoom')) {
			// Only fit bounds if we have actual markers in the group
			const bounds = mapState.markerGroup.getBounds()
			if (bounds.isValid()) {
				mapState.isProgrammaticChange = true
				mapState.instance.fitBounds(bounds.pad(0.2))
				setTimeout(() => {
					mapState.isProgrammaticChange = false
				}, 100)
			}
		}
	})

	// Sync zoom changes from props
	$effect(() => {
		if (mapState.instance && zoom !== mapState.instance.getZoom()) {
			mapState.isProgrammaticChange = true
			mapState.instance.setZoom(zoom)
			setTimeout(() => {
				mapState.isProgrammaticChange = false
			}, 100)
		}
	})

	// Expose method to clear the temporary new marker
	export function clearNewMarker() {
		if (mapState.newMarker && mapState.instance) {
			mapState.instance.removeLayer(mapState.newMarker)
			mapState.newMarker = null
		}
	}
</script>

<div id={mapId} class="Map" use:setup></div>

<style>
	.Map {
		--map-tiles-filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
		width: 100%;
		height: 100%;
		background-color: transparent;
		:global(.leaflet-container) {
			font-family: firava, system-ui, sans-serif;
		}
		:global(.leaflet-popup-content a) {
			color: var(--gray-12);
			font-size: 1rem;
			white-space: pre;
		}

		:global(.leaflet-popup-content-wrapper, .leaflet-popup-tip) {
			background-color: var(--gray-2);
		}

		@media (prefers-color-scheme: dark) {
			:global(.Map-tiles) {
				filter: var(--map-tiles-filter, none);
			}
		}
	}
</style>
