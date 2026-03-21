<script>
	import {goto} from '$app/navigation'
	import maplibregl from 'maplibre-gl'
	/** @import { GeoJSONSource } from 'maplibre-gl' */
	import {mount, onDestroy, unmount, untrack} from 'svelte'
	import MapComponent from './map.svelte'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import {BroadcastLayer} from './map-broadcast-layer.js'
	import {channelsCollection} from '$lib/collections/channels'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	import * as m from '$lib/paraglide/messages'
	const channelActivity = $derived(getChannelActivity())

	/** @type {{channels?: any[], loading?: boolean, latitude?: number|null, longitude?: number|null, zoom?: number|null, syncUrl?: boolean, openSlug?: string|null, openRequestKey?: string|null, linkToMap?: boolean | 'global', showControls?: boolean, globeMode?: boolean, showGraticules?: boolean, showDayNight?: boolean, tileStyle?: 'carto' | 'topo' | 'satellite'}} */
	let {
		channels = [],
		loading = false,
		latitude = null,
		longitude = null,
		zoom = null,
		syncUrl = true,
		openSlug = null,
		openRequestKey = null,
		linkToMap = true,
		showControls = true,
		globeMode = $bindable(false),
		showGraticules = $bindable(false),
		showDayNight = $bindable(false),
		tileStyle = $bindable('carto')
	} = $props()

	/** @type {maplibregl.Map | null} */
	let map = $state(null)
	let mapReady = $state(false)
	/** @type {BroadcastLayer | null} */
	let broadcastLayer = null
	let popupNavigationInFlight = false
	let pendingPopupLinkNavigationTimer = null
	let lastAutoOpenedToken = null
	let autoOpenRetryTimer = null
	let stickyPopupSlug = null
	let stickyPopupUntil = 0
	/** @type {Array<() => void>} */
	let popupCleanupFns = []
	/** @type {maplibregl.Popup | null} */
	let currentPopup = null
	const favoriteIds = $derived(channelActivity.favoriteChannelIds)
	const broadcastingIds = $derived(channelActivity.broadcastingChannelIds)
	const playingSlugs = $derived(channelActivity.playingChannelSlugs)
	const inDeckSlugs = $derived(channelActivity.inDeckChannelSlugs)
	const mapChannels = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt inside $derived.by, no mutation after creation
		const byId = new Map()
		for (const channel of channels) {
			const lat = Number(channel?.latitude)
			const lng = Number(channel?.longitude)
			if (
				!channel ||
				typeof channel.id !== 'string' ||
				typeof channel.slug !== 'string' ||
				!Number.isFinite(lat) ||
				!Number.isFinite(lng)
			)
				continue
			if (!byId.has(channel.id)) byId.set(channel.id, {...channel, latitude: lat, longitude: lng})
		}
		return [...byId.values()]
	})
	// GeoJSON derived from channel data — only recomputes when mapChannels changes,
	// not on mapReady toggles (tile style changes etc.)
	const cachedGeoJSON = $derived.by(() => {
		if (loading) return null
		return buildGeoJSON()
	})

	function getLatestChannel(channel) {
		return channelsCollection.state.get(channel.id) || channel
	}

	const _colorCanvas = document.createElement('canvas')
	_colorCanvas.width = _colorCanvas.height = 1
	const _colorCtx = /** @type {CanvasRenderingContext2D} */ (
		_colorCanvas.getContext('2d', {willReadFrequently: true})
	)

	function resolveCssColor(variableName, fallback = '#888888') {
		const div = document.createElement('div')
		div.style.color = `var(${variableName})`
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.append(div)
		const raw = getComputedStyle(div).color
		div.remove()
		// Normalize to rgb() — getComputedStyle may return oklch() in modern browsers,
		// which MapLibre's color parser doesn't support. Canvas always gives sRGB bytes.
		_colorCtx.clearRect(0, 0, 1, 1)
		_colorCtx.fillStyle = raw || fallback
		_colorCtx.fillRect(0, 0, 1, 1)
		const [r, g, b] = _colorCtx.getImageData(0, 0, 1, 1).data
		return `rgb(${r}, ${g}, ${b})`
	}

	const palette = $derived.by(() => ({
		normalStroke: resolveCssColor('--accent-6'),
		normalFill: resolveCssColor('--gray-8'),
		favoriteStroke: resolveCssColor('--accent-9'),
		favoriteFill: resolveCssColor('--accent-6'),
		activeStroke: resolveCssColor('--accent-11'),
		activeFill: resolveCssColor('--accent-9'),
		// broadcasting: light accent fill (same var as channel-card's .playing bg) + thick stroke
		broadcastingStroke: resolveCssColor('--accent-11'),
		broadcastingFill: resolveCssColor('--accent-3')
	}))

	function getChannelState(channel) {
		const current = getLatestChannel(channel)
		const isFavorite = favoriteIds.has(current.id)
		const isBroadcasting = broadcastingIds.has(current.id)
		const isPlaying = playingSlugs.has(current.slug)
		const isInDeck = inDeckSlugs.has(current.slug)
		const isActive = isBroadcasting || isPlaying || isInDeck
		return {isFavorite, isBroadcasting, isPlaying, isInDeck, isActive}
	}

	function getMarkerStyle(channel) {
		const state = getChannelState(channel)
		// 4-tier visual hierarchy: broadcasting > active > favorite > normal
		// mirrors the channel card: .playing uses --accent-3 bg, broadcasting shows a live badge
		if (state.isBroadcasting) {
			return {
				radius: 9,
				strokeColor: palette.broadcastingStroke,
				fillColor: palette.broadcastingFill,
				strokeWidth: 3
			}
		}
		if (state.isActive) {
			return {
				radius: 8,
				strokeColor: palette.activeStroke,
				fillColor: palette.activeFill,
				strokeWidth: 2
			}
		}
		if (state.isFavorite) {
			return {
				radius: 7,
				strokeColor: palette.favoriteStroke,
				fillColor: palette.favoriteFill,
				strokeWidth: 2
			}
		}
		return {
			radius: 5,
			strokeColor: palette.normalStroke,
			fillColor: palette.normalFill,
			strokeWidth: 1.5
		}
	}

	/** @returns {GeoJSON.FeatureCollection} */
	function buildGeoJSON() {
		return {
			type: 'FeatureCollection',
			features: mapChannels.map((c) => {
				const style = untrack(() => getMarkerStyle(c))
				/** @type {GeoJSON.Feature} */
				return {
					type: 'Feature',
					geometry: {type: 'Point', coordinates: [c.longitude, c.latitude]},
					properties: {
						id: c.id,
						slug: c.slug,
						radius: style.radius,
						strokeColor: style.strokeColor,
						fillColor: style.fillColor,
						strokeWidth: style.strokeWidth,
						isBroadcasting: broadcastingIds.has(c.id)
					}
				}
			})
		}
	}

	/** @returns {GeoJSON.FeatureCollection} */
	function buildStyledGeoJSON() {
		return {
			type: 'FeatureCollection',
			features: mapChannels.map((c) => {
				const style = untrack(() => getMarkerStyle(c))
				/** @type {GeoJSON.Feature} */
				return {
					type: 'Feature',
					geometry: {type: 'Point', coordinates: [c.longitude, c.latitude]},
					properties: {
						id: c.id,
						slug: c.slug,
						radius: style.radius,
						strokeColor: style.strokeColor,
						fillColor: style.fillColor,
						strokeWidth: style.strokeWidth,
						isBroadcasting: broadcastingIds.has(c.id)
					}
				}
			})
		}
	}

	/** @param {maplibregl.Map} m @param {any} fc */
	function setupLayers(m, fc) {
		if (!m || !fc) return
		if (!m.getSource('channels-source')) {
			m.addSource('channels-source', {type: 'geojson', data: fc})
			m.addLayer({
				id: 'channels-layer',
				type: 'circle',
				source: 'channels-source',
				paint: {
					'circle-radius': ['get', 'radius'],
					'circle-color': ['get', 'fillColor'],
					'circle-stroke-color': ['get', 'strokeColor'],
					'circle-stroke-width': ['get', 'strokeWidth'],
					'circle-opacity': 1
				}
			})

			m.on('click', 'channels-layer', (e) => {
				if (!e.features?.length) return
				const feature = e.features[0]
				const slug = feature.properties?.slug
				if (!slug) return
				const channel = mapChannels.find((c) => c.slug === slug)
				if (!channel) return
				const geom = /** @type {GeoJSON.Point} */ (feature.geometry)
				openPopupForChannel(channel, geom.coordinates)
				stickyPopupSlug = slug
			})

			m.on('mouseenter', 'channels-layer', () => {
				m.getCanvas().style.cursor = 'pointer'
			})
			m.on('mouseleave', 'channels-layer', () => {
				m.getCanvas().style.cursor = ''
			})
		} else {
			const source = /** @type {GeoJSONSource | undefined} */ (m.getSource('channels-source'))
			source?.setData(fc)
		}
	}

	function openPopupForChannel(channel, coordinates) {
		if (currentPopup) {
			currentPopup.remove()
			currentPopup = null
		}
		for (const cleanup of popupCleanupFns) cleanup()
		popupCleanupFns = []

		const container = document.createElement('div')
		container.className = 'map-popup'

		let mountedCard = null
		let keepPopupOpenUntil = 0

		const currentChannel = getLatestChannel(channel)
		mountedCard = mount(ChannelCard, {
			target: container,
			props: {
				channel: currentChannel,
				href: `/${currentChannel.slug}`,
				updatedAtHref:
					linkToMap === 'global'
						? `/?display=map&slug=${encodeURIComponent(currentChannel.slug)}&zoom=4`
						: `/${currentChannel.slug}/map`
			}
		})

		const onPopupClick = (event) => {
			const target =
				event.target instanceof Element
					? event.target
					: event.target instanceof Node
						? event.target.parentElement
						: null
			if (!target) return
			if (target.closest('.maplibregl-popup-close-button')) return
			const clickedButton = target.closest('button, [role="button"]')
			if (clickedButton) {
				keepPopupOpenUntil = Date.now() + 3000
				stickyPopupSlug = channel.slug
				stickyPopupUntil = keepPopupOpenUntil
			}
			const link = target.closest('a[href]')
			if (link instanceof HTMLAnchorElement) {
				event.preventDefault()
				event.stopPropagation()
				if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
				if (event.detail > 1) {
					clearPendingPopupLinkNavigation()
					return
				}
				const href = link.getAttribute('href')
				if (!href) return
				if (href.startsWith('#')) return
				if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//'))
					return
				if (popupNavigationInFlight) return
				clearPendingPopupLinkNavigation()
				pendingPopupLinkNavigationTimer = setTimeout(() => {
					pendingPopupLinkNavigationTimer = null
					if (popupNavigationInFlight) return
					popupNavigationInFlight = true
					setTimeout(() => {
						popupNavigationInFlight = false
					}, 450)
					void goto(href, {keepFocus: true})
				}, 280)
				return
			}
			if (event.detail === 2) {
				keepPopupOpenUntil = Date.now() + 3000
				stickyPopupSlug = channel.slug
				stickyPopupUntil = keepPopupOpenUntil
			}
		}

		container.addEventListener('click', onPopupClick, true)

		const popup = new maplibregl.Popup({closeButton: true, maxWidth: 'none'})
			.setLngLat(coordinates)
			.setDOMContent(container)
			.addTo(/** @type {maplibregl.Map} */ (map))

		popup.on('close', () => {
			if (Date.now() < keepPopupOpenUntil && map) {
				requestAnimationFrame(() => {
					if (!map) return
					const channel2 = mapChannels.find((c) => c.slug === stickyPopupSlug)
					if (channel2) openPopupForChannel(channel2, [channel2.longitude, channel2.latitude])
				})
			} else {
				currentPopup = null
			}
		})

		popupCleanupFns.push(() => {
			container.removeEventListener('click', onPopupClick, true)
			if (mountedCard) {
				try {
					void unmount(mountedCard)
				} catch {
					// ignore teardown races
				}
				mountedCard = null
			}
		})

		currentPopup = popup
	}

	function updateBroadcastLayer() {
		if (!broadcastLayer || !mapReady) return
		broadcastLayer.setChannels(
			mapChannels
				.filter((c) => broadcastingIds.has(c.id))
				.map((c) => ({id: c.id, lng: c.longitude, lat: c.latitude}))
		)
	}

	// ── Tile styles ────────────────────────────────────────────────────────────

	/** @param {'carto'|'topo'|'satellite'} name @returns {import('maplibre-gl').StyleSpecification} */
	function buildMapStyle(name) {
		const dark = document.documentElement.classList.contains('dark')
		if (name === 'topo') {
			return {
				version: 8,
				sources: {
					topo: {
						type: 'raster',
						tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
						tileSize: 256,
						maxzoom: 17,
						attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
					}
				},
				layers: [{id: 'topo', type: 'raster', source: 'topo'}]
			}
		}
		if (name === 'satellite') {
			return {
				version: 8,
				sources: {
					satellite: {
						type: 'raster',
						tiles: [
							'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
						],
						tileSize: 256,
						maxzoom: 19,
						attribution: 'Powered by Esri'
					}
				},
				layers: [{id: 'satellite', type: 'raster', source: 'satellite'}]
			}
		}
		// carto – mirrors map.svelte's buildStyle
		const base = dark
			? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
			: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
		return {
			version: 8,
			sources: {
				carto: {
					type: 'raster',
					tiles: [base.replace('{s}', 'a'), base.replace('{s}', 'b'), base.replace('{s}', 'c')],
					tileSize: 256,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
				}
			},
			layers: [{id: 'carto', type: 'raster', source: 'carto'}]
		}
	}

	// ── Overlay GeoJSON builders ─────────────────────────────────────────────

	/** Lines at equator, tropics of Cancer/Capricorn, Arctic/Antarctic circles. */
	function buildGraticuleGeoJSON() {
		/** @type {{id: string, lat: number}[]} */
		const lines = [
			{id: 'equator', lat: 0},
			{id: 'tropic-cancer', lat: 23.4368},
			{id: 'tropic-capricorn', lat: -23.4368},
			{id: 'arctic', lat: 66.563},
			{id: 'antarctic', lat: -66.563}
		]
		return {
			type: 'FeatureCollection',
			features: lines.map(({id, lat}) => ({
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: [
						[-180, lat],
						[180, lat]
					]
				},
				properties: {id}
			}))
		}
	}

	/** Night-side polygon computed from current solar position. */
	/** @returns {import('geojson').FeatureCollection} */
	function buildNightGeoJSON() {
		const now = new Date()
		const dayOfYear = Math.round(
			(now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000
		)
		const decDeg = -23.45 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10))
		const dec = (decDeg * Math.PI) / 180
		// Small epsilon avoids tan(0) singularity at equinoxes
		const tanDec = Math.abs(dec) < 0.002 ? 0.002 * Math.sign(dec || 1) : Math.tan(dec)
		const noonLng = (12 - (now.getUTCHours() + now.getUTCMinutes() / 60)) * 15

		const coords = []
		for (let lng = -180; lng <= 180; lng += 2) {
			const ha = ((lng - noonLng) * Math.PI) / 180
			coords.push([lng, (Math.atan(-Math.cos(ha) / tanDec) * 180) / Math.PI])
		}

		// Build a CCW polygon (GeoJSON right-hand rule).
		// Verified via shoelace: for dec≥0 (summer N) south pole is in night → reversed terminator;
		// for dec<0 (winter N / current spring) north pole is in night → original (W→E) terminator.
		const nightPole = decDeg >= 0 ? -90 : 90
		let ring
		if (decDeg >= 0) {
			const rev = coords.toReversed()
			ring = [...rev, [-180, nightPole], [180, nightPole], rev[0]]
		} else {
			ring = [...coords, [180, nightPole], [-180, nightPole], coords[0]]
		}
		return {
			type: 'FeatureCollection',
			features: [
				{type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, properties: {}}
			]
		}
	}

	// ── Overlay layer setup ──────────────────────────────────────────────────

	/** Add night-fill + graticule line layers. Called before channels-layer so they render beneath. */
	function setupOverlays(m) {
		if (!m.getSource('night-source')) {
			m.addSource('night-source', {type: 'geojson', data: buildNightGeoJSON()})
			m.addLayer({
				id: 'night-layer',
				type: 'fill',
				source: 'night-source',
				paint: {'fill-color': '#0a0a2e', 'fill-opacity': 0.45},
				layout: {visibility: showDayNight ? 'visible' : 'none'}
			})
		}
		if (!m.getSource('graticule-source')) {
			m.addSource('graticule-source', {type: 'geojson', data: buildGraticuleGeoJSON()})
			// Equator: solid red
			m.addLayer({
				id: 'graticule-equator',
				type: 'line',
				source: 'graticule-source',
				filter: ['==', ['get', 'id'], 'equator'],
				paint: {'line-color': '#cc4444', 'line-width': 1.5, 'line-opacity': 0.75},
				layout: {visibility: showGraticules ? 'visible' : 'none'}
			})
			// Tropics & polar circles: dashed blue-gray
			m.addLayer({
				id: 'graticule-other',
				type: 'line',
				source: 'graticule-source',
				filter: ['!=', ['get', 'id'], 'equator'],
				paint: {
					'line-color': '#6699bb',
					'line-width': 1,
					'line-opacity': 0.6,
					'line-dasharray': [4, 4]
				},
				layout: {visibility: showGraticules ? 'visible' : 'none'}
			})
		}
	}

	function updateNightLayer() {
		if (!map || !mapReady) return
		const nightSource = /** @type {GeoJSONSource | undefined} */ (map.getSource('night-source'))
		nightSource?.setData(buildNightGeoJSON())
	}

	function handleReady(m) {
		map = m
		setupOverlays(m)
		if (!broadcastLayer) broadcastLayer = new BroadcastLayer()
		if (!m.getLayer('broadcast-3d')) m.addLayer(/** @type {any} */ (broadcastLayer))
		updateBroadcastLayer()
		mapReady = true // triggers the map-ready effect below
		maybeAutoOpenSlug(openSlug, openRequestKey)
	}

	function refreshMarkerStyles() {
		if (!map || !mapReady) return
		const source = /** @type {GeoJSONSource | undefined} */ (map.getSource('channels-source'))
		if (!source) return
		source.setData(untrack(buildStyledGeoJSON))
	}

	function clearAutoOpenRetry() {
		if (autoOpenRetryTimer) {
			clearTimeout(autoOpenRetryTimer)
			autoOpenRetryTimer = null
		}
	}

	function clearPendingPopupLinkNavigation() {
		if (pendingPopupLinkNavigationTimer) {
			clearTimeout(pendingPopupLinkNavigationTimer)
			pendingPopupLinkNavigationTimer = null
		}
	}

	/**
	 * @param {string | null | undefined} slug
	 * @param {string | null | undefined} requestKey
	 * @param {number} [attempt]
	 */
	function maybeAutoOpenSlug(slug, requestKey, attempt = 0) {
		if (!slug || !map || !mapReady) return
		const token = `${requestKey ?? ''}|${slug}`
		if (token === lastAutoOpenedToken) return
		const channel = mapChannels.find((c) => c.slug === slug)
		if (channel) {
			const targetZoom = Math.max(map.getZoom(), map.getMinZoom())
			map.setCenter([channel.longitude, channel.latitude])
			map.setZoom(targetZoom)
			requestAnimationFrame(() => {
				if (!map) return
				openPopupForChannel(channel, [channel.longitude, channel.latitude])
				lastAutoOpenedToken = token
				clearAutoOpenRetry()
			})
			return
		}
		if (attempt >= 40) return
		clearAutoOpenRetry()
		autoOpenRetryTimer = setTimeout(() => {
			autoOpenRetryTimer = null
			maybeAutoOpenSlug(slug, requestKey, attempt + 1)
		}, 120)
	}

	// Render markers when map is ready AND data is available.
	// setupLayers is idempotent (creates source on first call, updates on subsequent).
	$effect(() => {
		const fc = cachedGeoJSON
		const m = map
		const ready = mapReady
		if (!m || !ready || !fc) return
		setupLayers(m, fc)
		// Restore sticky popup after data refresh
		if (Date.now() < stickyPopupUntil && stickyPopupSlug) {
			const slug = stickyPopupSlug
			requestAnimationFrame(() => {
				const channel = mapChannels.find((c) => c.slug === slug)
				if (channel) openPopupForChannel(channel, [channel.longitude, channel.latitude])
			})
		}
	})

	$effect(() => {
		void favoriteIds
		void broadcastingIds
		void playingSlugs
		void inDeckSlugs
		void palette
		refreshMarkerStyles()
	})

	$effect(() => {
		void broadcastingIds
		void mapChannels
		updateBroadcastLayer()
	})

	$effect(() => {
		if (!openSlug) {
			lastAutoOpenedToken = null
			clearAutoOpenRetry()
			return
		}
		maybeAutoOpenSlug(openSlug, openRequestKey)
	})

	$effect(() => {
		if (!map || !mapReady) return
		map.setProjection({type: globeMode ? 'globe' : 'mercator'})
	})

	// Tile style switcher: apply when user changes, re-add all layers via styledata callback.
	// map.svelte only hooks styledata on theme changes — we must do it ourselves here.
	$effect(() => {
		const style = tileStyle
		if (!map || !mapReady) return
		const sourceId = style === 'carto' ? 'carto' : style
		if (map.getSource(sourceId)) return // already applied
		mapReady = false // block other effects during transition
		const m = map
		m.setStyle(buildMapStyle(style))
		m.once('styledata', () => {
			setupOverlays(m)
			if (!broadcastLayer) broadcastLayer = new BroadcastLayer()
			if (!m.getLayer('broadcast-3d')) m.addLayer(/** @type {any} */ (broadcastLayer))
			updateBroadcastLayer()
			mapReady = true // triggers the map-ready effect below
		})
	})

	// Graticule visibility toggle
	$effect(() => {
		const vis = showGraticules ? 'visible' : 'none'
		if (!map || !mapReady) return
		if (map.getLayer('graticule-equator'))
			map.setLayoutProperty('graticule-equator', 'visibility', vis)
		if (map.getLayer('graticule-other')) map.setLayoutProperty('graticule-other', 'visibility', vis)
	})

	// Day/night visibility + 1-min update timer
	$effect(() => {
		const vis = showDayNight ? 'visible' : 'none'
		if (!map || !mapReady) return
		if (map.getLayer('night-layer')) map.setLayoutProperty('night-layer', 'visibility', vis)
		if (!showDayNight) return
		updateNightLayer()
		const id = setInterval(updateNightLayer, 60_000)
		return () => clearInterval(id)
	})

	onDestroy(() => {
		clearAutoOpenRetry()
		clearPendingPopupLinkNavigation()
		for (const cleanup of popupCleanupFns) cleanup()
		popupCleanupFns = []
		if (currentPopup) {
			currentPopup.remove()
			currentPopup = null
		}
	})
</script>

<div class="map-root">
	<MapComponent onready={handleReady} {latitude} {longitude} {zoom} {syncUrl} />
	{#if loading}
		<div class="map-loading">loading {channels.length}…</div>
	{/if}
	{#if showControls}
		<div class="map-controls">
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
		</div>
	{/if}
</div>

<style>
	.map-root {
		display: flex;
		flex: 1;
		min-height: 0;
		height: 100%;
		position: relative;
	}

	.map-loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--gray-1);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius);
		font-size: var(--font-3);
		pointer-events: none;
		z-index: 10;
	}

	/* Single horizontal row of controls below map filters */
	.map-controls {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		z-index: 10;
	}

	.map-controls menu.nav-grouped {
		margin: 0;
	}

	:global(.maplibregl-map) {
		font-family: var(--font-sans);
	}

	:global(.map-popup) {
		width: 14.5rem;
		/* overwrite maplibre */
		font-family: var(--font-sans);
	}

	:global(.maplibregl-popup-content) {
		padding: 0;
		background: var(--gray-1);
		color: var(--gray-12);
		box-shadow: var(--shadow-modal);
		border-radius: var(--border-radius);
	}

	:global(.maplibregl-popup-tip) {
		border-top-color: var(--gray-1);
		border-bottom-color: var(--gray-1);
	}

	:global(.maplibregl-popup-close-button) {
		top: var(--space-1);
		right: var(--space-1);
		width: 1.75rem;
		height: 1.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--border-radius);
		background: var(--gray-2);
		color: var(--gray-12);
		font-size: 1rem;
		line-height: 1;
		text-decoration: none;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}

	:global(.maplibregl-popup-close-button:hover),
	:global(.maplibregl-popup-close-button:focus-visible) {
		background: var(--gray-3);
		border-color: var(--gray-6);
		color: var(--accent-11);
		outline: none;
	}
</style>
