<script>
	import {goto} from '$app/navigation'
	import L from 'leaflet'
	import {mount, onDestroy, unmount, untrack} from 'svelte'
	import MapComponent from './map.svelte'
	import ChannelCard from './channel-card.svelte'
	import {appState} from '$lib/app-state.svelte'
	import {
		broadcastsCollection,
		followsCollection,
		channelsCollection,
		tracksCollection
	} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import {deriveChannelActivityState} from './channel-ui-state.js'

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

	let map = null
	let markersLayer = null
	let popupNavigationInFlight = false
	let lastAutoOpenedToken = null
	let autoOpenRetryTimer = null
	let suppressMapClickCloseUntil = 0
	/** @type {Array<() => void>} */
	let popupCleanupFns = []
	/** @type {Map<string, L.CircleMarker>} */
	let markerByChannelId = new Map()
	/** @type {Map<string, L.CircleMarker>} */
	let markerBySlug = new Map()
	const followsQuery = useLiveQuery((q) => q.from({follows: followsCollection}))
	const broadcastsQuery = useLiveQuery((q) => q.from({b: broadcastsCollection}))
	const activityState = $derived.by(() => {
		const followsRows = followsQuery.data ?? []
		void broadcastsCollection.state.size
		void tracksCollection.state.size
		void channelsCollection.state.size
		const followsState = new Map(
			followsRows
				.map((row) => ({id: typeof row === 'string' ? row : row?.id}))
				.filter((row) => typeof row.id === 'string')
				.map((row) => [row.id, row])
		)
		return deriveChannelActivityState({
			decks: appState.decks,
			tracksState: tracksCollection.state,
			channelsState: channelsCollection.state,
			followsState,
			broadcastRows: broadcastsQuery.data ?? []
		})
	})
	const favoriteIds = $derived(activityState.favoriteChannelIds)
	const broadcastingIds = $derived(activityState.broadcastingChannelIds)
	const playingSlugs = $derived(activityState.playingChannelSlugs)
	const inDeckSlugs = $derived(activityState.inDeckChannelSlugs)
	const mapChannels = $derived.by(() => {
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
	const markerDataKey = $derived(
		mapChannels
			.map((channel) => `${channel.id}:${channel.slug}:${channel.latitude}:${channel.longitude}`)
			.sort()
			.join('|')
	)
	const normalizeSlug = (value) => String(value || '').trim().toLowerCase()

	function getLatestChannel(channel) {
		return channelsCollection.state.get(channel.id) || channel
	}

	function resolveCssColor(variableName, fallback = '#888') {
		const div = document.createElement('div')
		div.style.color = `var(${variableName})`
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.append(div)
		const color = getComputedStyle(div).color
		div.remove()
		return color || fallback
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
			color: stroke,
			weight: state.isActive || state.isFavorite ? 2 : 1.5,
			fillColor: fill,
			fillOpacity: 1
		}
	}

	function handleReady(m) {
		map = m
		markersLayer = L.layerGroup().addTo(map)
		map.on('click', (event) => {
			if (Date.now() < suppressMapClickCloseUntil) return
			const target = event?.originalEvent?.target
			if (
				target instanceof Element &&
				(target.closest('.leaflet-popup') || target.closest('.leaflet-interactive') || target.closest('.leaflet-control'))
			) {
				return
			}
			map?.closePopup()
		})
		updateMarkers()
	}

	function refreshMarkerStyles() {
		for (const channel of mapChannels) {
			const marker = markerByChannelId.get(channel.id)
			if (!marker) continue
			marker.setStyle(getMarkerStyle(channel))
			applyMarkerClasses(marker, channel)
		}
	}

	/** @param {L.CircleMarker} marker @param {any} channel */
	function applyMarkerClasses(marker, channel) {
		const state = getChannelState(channel)
		const el = marker.getElement?.() || marker._path
		if (!el) return
		el.classList.add('map-pin')
		el.classList.toggle('map-pin--broadcasting', state.isBroadcasting)
		el.classList.toggle('map-pin--active', state.isActive)
	}

	function clearAutoOpenRetry() {
		if (autoOpenRetryTimer) {
			clearTimeout(autoOpenRetryTimer)
			autoOpenRetryTimer = null
		}
	}

	/**
	 * Auto-open a slug once (per request token), retrying briefly while map markers settle.
	 * @param {string | null | undefined} slug
	 * @param {string | null | undefined} requestKey
	 * @param {number} [attempt]
	 */
	function maybeAutoOpenSlug(slug, requestKey, attempt = 0) {
		const normalizedSlug = normalizeSlug(slug)
		if (!normalizedSlug || !map) return
		const token = `${requestKey ?? ''}|${normalizedSlug}`
		if (token === lastAutoOpenedToken) return
		const marker = markerBySlug.get(normalizedSlug)
		const channel = mapChannels.find((c) => normalizeSlug(c.slug) === normalizedSlug)
		if (marker && channel) {
			const targetZoom = Math.max(map.getZoom(), map.getMinZoom())
			map.setView([channel.latitude, channel.longitude], targetZoom, {animate: false})
			suppressMapClickCloseUntil = Date.now() + 450
			requestAnimationFrame(() => {
				if (!map) return
				if (markerBySlug.get(normalizedSlug) !== marker) {
					if (attempt >= 40) return
					clearAutoOpenRetry()
					autoOpenRetryTimer = setTimeout(() => {
						autoOpenRetryTimer = null
						maybeAutoOpenSlug(slug, requestKey, attempt + 1)
					}, 120)
					return
				}
				const latlng = marker.getLatLng?.()
				const hasLatLng = Number.isFinite(latlng?.lat) && Number.isFinite(latlng?.lng)
				if (hasLatLng) {
					try {
						marker.openPopup()
					} catch {
						// Marker/popup may be in teardown; retry below.
					}
					if (!marker.isPopupOpen?.()) {
						const popup = marker.getPopup?.()
						if (popup) {
							try {
								map.openPopup(popup, latlng)
							} catch {
								// ignore; retry below
							}
						}
					}
				}
				if (marker.isPopupOpen?.()) {
					lastAutoOpenedToken = token
					clearAutoOpenRetry()
					return
				}
				if (attempt >= 40) return
				clearAutoOpenRetry()
				autoOpenRetryTimer = setTimeout(() => {
					autoOpenRetryTimer = null
					maybeAutoOpenSlug(slug, requestKey, attempt + 1)
				}, 120)
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

	function updateMarkers() {
		if (!markersLayer) return
		for (const cleanup of popupCleanupFns) cleanup()
		popupCleanupFns = []
		markerByChannelId.clear()
		markerBySlug.clear()
		markersLayer.clearLayers()

		for (const c of mapChannels) {
			const popup = document.createElement('div')
			popup.className = 'map-popup'
			L.DomEvent.disableClickPropagation(popup)
			L.DomEvent.disableScrollPropagation(popup)
			const cardRoot = document.createElement('div')
			let mountedCard = null
			const onPopupClick = (event) => {
				const target =
					event.target instanceof Element
						? event.target
						: event.target instanceof Node
							? event.target.parentElement
							: null
				if (!target) return
				if (target.closest('.leaflet-popup-close-button')) return
				const link = target.closest('a[href]')
				if (!(link instanceof HTMLAnchorElement)) return
				const href = link.getAttribute('href')
				if (!href) return
				if (href.startsWith('#')) return
				event.preventDefault()
				event.stopPropagation()
				if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
				// Never let popup links unload the app while audio is playing.
				if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return
				if (popupNavigationInFlight) return
				popupNavigationInFlight = true
				setTimeout(() => {
					popupNavigationInFlight = false
				}, 450)
				void goto(href, {keepFocus: true})
			}
			const onPopupDblClick = (event) => {
				const target =
					event.target instanceof Element
						? event.target
						: event.target instanceof Node
							? event.target.parentElement
							: null
				if (!target) return
				const link = target.closest('a[href]')
				if (!(link instanceof HTMLAnchorElement)) return
				event.preventDefault()
				event.stopPropagation()
				if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
			}
			popup.addEventListener('click', onPopupClick, true)
			popup.addEventListener('dblclick', onPopupDblClick, true)
			const renderPopup = () => {
				if (mountedCard) return
				const currentChannel = getLatestChannel(c)
				popup.replaceChildren()
				popup.append(cardRoot)
				mountedCard = mount(ChannelCard, {
					target: cardRoot,
					props: {
						channel: currentChannel,
						href: `/${currentChannel.slug}`,
						updatedAtHref:
							linkToMap === 'global'
								? `/?display=map&slug=${encodeURIComponent(currentChannel.slug)}&zoom=4`
								: `/${currentChannel.slug}/map`
					}
				})
			}
			const cleanupPopup = () => {
				popup.removeEventListener('click', onPopupClick, true)
				popup.removeEventListener('dblclick', onPopupDblClick, true)
				if (mountedCard) {
					try {
						void unmount(mountedCard)
					} catch {
						// Ignore Leaflet teardown races.
					}
					mountedCard = null
				}
				popup.replaceChildren()
			}
			popupCleanupFns.push(cleanupPopup)
			renderPopup()

			const marker = L.circleMarker([c.latitude, c.longitude], {
				...untrack(() => getMarkerStyle(c)),
				className: 'map-pin',
				bubblingMouseEvents: false,
				interactive: true
			})
				.bindPopup(popup, {autoPan: false, closeOnClick: false, autoClose: true})
				.addTo(markersLayer)
			applyMarkerClasses(marker, c)
			marker.on('click', () => marker.openPopup())
			markerByChannelId.set(c.id, marker)
			markerBySlug.set(normalizeSlug(c.slug), marker)
		}
		maybeAutoOpenSlug(openSlug, openRequestKey)
	}

	$effect(() => {
		void markerDataKey
		void linkToMap
		updateMarkers()
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
		if (!openSlug) {
			lastAutoOpenedToken = null
			clearAutoOpenRetry()
			return
		}
		maybeAutoOpenSlug(openSlug, openRequestKey)
	})

	onDestroy(() => {
		clearAutoOpenRetry()
		for (const cleanup of popupCleanupFns) cleanup()
		popupCleanupFns = []
		for (const marker of markerByChannelId.values()) marker.off()
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
		width: 14.5rem;
	}

	:global(.leaflet-popup-content-wrapper) {
		padding: 0;
	}

	:global(.leaflet-popup-content) {
		margin: 0;
	}

	/* Keep ChannelCard link/theme colors in Leaflet popups.
	   Leaflet defaults (.leaflet-container a) otherwise force blue links. */
	:global(.leaflet-container .map-popup article a:link),
	:global(.leaflet-container .map-popup article a:visited) {
		color: inherit;
	}

	:global(.leaflet-popup-content-wrapper),
	:global(.leaflet-popup-tip) {
		background: var(--gray-1);
		color: var(--gray-12);
		box-shadow: var(--shadow-modal);
	}

	:global(.leaflet-interactive.map-pin--broadcasting) {
		animation: map-pin-broadcast-wave 1.8s ease-out infinite;
	}

	@keyframes map-pin-broadcast-wave {
		0% {
			stroke-width: 2;
			filter: drop-shadow(0 0 0 var(--accent-9));
		}
		45% {
			stroke-width: 4;
			filter: drop-shadow(0 0 6px var(--accent-9))
				drop-shadow(0 0 12px color-mix(in oklab, var(--accent-9) 55%, transparent));
		}
		100% {
			stroke-width: 2;
			filter: drop-shadow(0 0 0 transparent);
		}
	}

	/* Make Leaflet close anchor look like an icon-only R4 button. */
	:global(.leaflet-container .leaflet-popup-close-button) {
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

	:global(.leaflet-container .leaflet-popup-close-button:hover),
	:global(.leaflet-container .leaflet-popup-close-button:focus-visible) {
		background: var(--gray-3);
		border-color: var(--gray-6);
		color: var(--accent-11);
		outline: none;
	}
</style>
