<script>
	import {goto} from '$app/navigation'
	import maplibregl from 'maplibre-gl'
	/** @import { GeoJSONSource } from 'maplibre-gl' */
	import {SvelteMap} from 'svelte/reactivity'
	import {mount, onDestroy, unmount, untrack} from 'svelte'
	import MapComponent from './map.svelte'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import {BroadcastLayer} from './map-broadcast-layer.js'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {channelsCollection} from '$lib/collections/channels'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	const channelActivity = $derived(getChannelActivity())

	/** @type {{channels?: any[], latitude?: number|null, longitude?: number|null, zoom?: number|null, syncUrl?: boolean, openSlug?: string|null, openRequestKey?: string|null, linkToMap?: boolean | 'global'}} */
	const {
		channels = [],
		latitude = null,
		longitude = null,
		zoom = null,
		syncUrl = true,
		openSlug = null,
		openRequestKey = null,
		linkToMap = true
	} = $props()

	/** @type {maplibregl.Map | null} */
	let map = $state(null)
	let mapReady = $state(false)
	/** @type {BroadcastLayer | null} */
	let broadcastLayer = null
	let globeMode = $state(false)
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
		const byId = new SvelteMap()
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
	const markerDataKey = $derived(
		mapChannels
			.map((channel) => `${channel.id}:${channel.slug}:${channel.latitude}:${channel.longitude}`)
			.sort()
			.join('|')
	)

	function getLatestChannel(channel) {
		return channelsCollection.state.get(channel.id) || channel
	}

	const _colorCanvas = document.createElement('canvas')
	_colorCanvas.width = _colorCanvas.height = 1
	const _colorCtx = /** @type {CanvasRenderingContext2D} */ (_colorCanvas.getContext('2d'))

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
		normalStroke: resolveCssColor('--gray-6'),
		normalFill: resolveCssColor('--gray-8'),
		favoriteStroke: resolveCssColor('--accent-9'),
		favoriteFill: resolveCssColor('--accent-6'),
		activeStroke: resolveCssColor('--accent-11'),
		activeFill: resolveCssColor('--accent-9')
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
		const stroke = state.isActive
			? palette.activeStroke
			: state.isFavorite
				? palette.favoriteStroke
				: palette.normalStroke
		const fill = state.isActive ? palette.activeFill : state.isFavorite ? palette.favoriteFill : palette.normalFill
		const radius = state.isActive ? 8 : state.isFavorite ? 7 : 6
		return {
			radius,
			strokeColor: stroke,
			fillColor: fill,
			strokeWidth: state.isActive || state.isFavorite ? 2 : 1.5
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
				const style = getMarkerStyle(c)
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

	/** @param {maplibregl.Map} m */
	function setupLayers(m) {
		const fc = untrack(buildGeoJSON)

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
			/** @type {GeoJSONSource} */ ;(m.getSource('channels-source')).setData(fc)
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
				if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return
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
			mapChannels.filter((c) => broadcastingIds.has(c.id)).map((c) => ({id: c.id, lng: c.longitude, lat: c.latitude}))
		)
	}

	function handleReady(m) {
		map = m
		mapReady = true
		setupLayers(m)
		if (!broadcastLayer) broadcastLayer = new BroadcastLayer()
		if (!m.getLayer('broadcast-3d')) m.addLayer(broadcastLayer)
		updateBroadcastLayer()
		maybeAutoOpenSlug(openSlug, openRequestKey)
	}

	function refreshMarkerStyles() {
		if (!map || !mapReady) return
		const source = /** @type {GeoJSONSource | undefined} */ (map.getSource('channels-source'))
		if (!source) return
		source.setData(buildStyledGeoJSON())
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

	$effect(() => {
		void markerDataKey
		if (!map || !mapReady) return
		const shouldRestoreSticky = Date.now() < stickyPopupUntil
		const restoreSlug = shouldRestoreSticky ? stickyPopupSlug : null
		setupLayers(map)
		if (restoreSlug) {
			requestAnimationFrame(() => {
				const channel = mapChannels.find((c) => c.slug === restoreSlug)
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
	<div class="map-controls maplibregl-ctrl-bottom-left">
		<div class="maplibregl-ctrl maplibregl-ctrl-group">
			<button
				type="button"
				class:active={globeMode}
				onclick={() => (globeMode = !globeMode)}
				{@attach tooltip({content: globeMode ? 'Switch to flat map' : 'Switch to globe', placement: 'right'})}
			>
				<Icon icon={globeMode ? 'map' : 'globe'} size={16} />
			</button>
		</div>
	</div>
</div>

<style>
	.map-root {
		display: flex;
		flex: 1;
		min-height: 0;
		height: 100%;
		position: relative;
	}

	/* Mirror MapLibre's bottom-left control positioning */
	.map-controls {
		position: absolute;
		bottom: 0;
		left: 0;
		z-index: 10;
		pointer-events: none;
	}

	.map-controls .maplibregl-ctrl {
		pointer-events: all;
		margin: 0 0 10px 10px;
		border: 1px solid light-dark(var(--gray-5), var(--gray-6));
		border-radius: var(--border-radius);
		overflow: hidden;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.map-controls button {
		width: 29px;
		height: 29px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: light-dark(var(--gray-1), var(--gray-3));
		border: none;
		cursor: pointer;
		padding: 0;
		color: light-dark(var(--gray-12), var(--gray-11));
	}

	.map-controls button:hover {
		background: light-dark(var(--gray-2), var(--gray-4));
	}

	.map-controls button.active {
		color: var(--accent-11);
		background: light-dark(var(--gray-2), var(--gray-4));
	}

	:global(.map-popup) {
		width: 14.5rem;
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
