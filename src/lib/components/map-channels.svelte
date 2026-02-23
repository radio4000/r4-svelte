<script>
	import L from 'leaflet'
	import {mount, unmount, onDestroy, untrack} from 'svelte'
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

	/** @type {{channels?: any[], latitude?: number|null, longitude?: number|null, zoom?: number|null, syncUrl?: boolean, openSlug?: string|null, linkToMap?: boolean | 'global'}} */
	const {
		channels = [],
		latitude = null,
		longitude = null,
		zoom = null,
		syncUrl = true,
		openSlug = null,
		linkToMap = true
	} = $props()

	let map = null
	let markersLayer = null
	/** @type {Array<() => void>} */
	let popupCleanupFns = []
	let selectedSlug = $state(/** @type {string | null} */ (null))
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
	const mapChannels = $derived(
		channels.filter(
			(channel) =>
				channel &&
				typeof channel.id === 'string' &&
				typeof channel.slug === 'string' &&
				Number.isFinite(channel.latitude) &&
				Number.isFinite(channel.longitude)
		)
	)
	const markerDataKey = $derived(
		mapChannels
			.map((channel) => `${channel.id}:${channel.slug}:${channel.latitude}:${channel.longitude}`)
			.sort()
			.join('|')
	)

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
		activeFill: resolveCssColor('--accent-9'),
		selectedStroke: resolveCssColor('--gray-12')
	}))

	function getChannelState(channel) {
		const current = getLatestChannel(channel)
		const isFavorite = favoriteIds.has(current.id)
		const isBroadcasting = broadcastingIds.has(current.id)
		const isPlaying = playingSlugs.has(current.slug)
		const isInDeck = inDeckSlugs.has(current.slug)
		const isActive = isBroadcasting || isPlaying || isInDeck
		const isSelected = selectedSlug === current.slug
		return {isFavorite, isBroadcasting, isPlaying, isInDeck, isActive, isSelected}
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
		if (state.isSelected) {
			return {
				radius: radius + 1,
				color: palette.selectedStroke,
				weight: 3,
				fillColor: fill,
				fillOpacity: 1
			}
		}
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
		updateMarkers()
	}

	function refreshMarkerStyles() {
		for (const channel of mapChannels) {
			const marker = markerByChannelId.get(channel.id)
			if (!marker) continue
			marker.setStyle(getMarkerStyle(channel))
		}
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
			const cardRoot = document.createElement('div')
			let mountedCard = null
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
						updatedAtHref: `/${currentChannel.slug}/map`
					}
				})
				// Popup content lives outside the normal Svelte tree (Leaflet-managed DOM).
				// Use hard navigation for links inside popup cards to avoid client-router
				// reconcile races during teardown.
				for (const link of popup.querySelectorAll('a[href]')) {
					link.addEventListener('click', (event) => {
						if (!(event.currentTarget instanceof HTMLAnchorElement)) return
						const href = event.currentTarget.getAttribute('href')
						if (!href) return
						if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return
						event.preventDefault()
						location.assign(href)
					})
				}
			}
			const cleanupPopup = () => {
				if (mountedCard) {
					try {
						void unmount(mountedCard)
					} catch {
						// Ignore cleanup races from external popup DOM teardown.
					}
					mountedCard = null
				}
				popup.replaceChildren()
			}
			popupCleanupFns.push(cleanupPopup)

			const marker = L.circleMarker(
				[c.latitude, c.longitude],
				untrack(() => getMarkerStyle(c))
			)
				.bindPopup(popup)
				.addTo(markersLayer)
			marker.on('click', () => {
				renderPopup()
			})
			marker.on('popupopen', () => {
				renderPopup()
				selectedSlug = c.slug
				refreshMarkerStyles()
			})
			marker.on('popupclose', () => {
				if (selectedSlug === c.slug) selectedSlug = null
				refreshMarkerStyles()
			})
			markerByChannelId.set(c.id, marker)
			markerBySlug.set(c.slug, marker)

			if (openSlug && c.slug === openSlug) {
				marker.openPopup()
			}
		}
	}

	$effect(() => {
		void markerDataKey
		void linkToMap
		updateMarkers()
	})

	$effect(() => {
		if (openSlug === undefined) return
		if (openSlug === selectedSlug) return
		selectedSlug = openSlug
	})

	$effect(() => {
		void selectedSlug
		void favoriteIds
		void broadcastingIds
		void playingSlugs
		void inDeckSlugs
		void palette
		refreshMarkerStyles()
	})

	$effect(() => {
		const slug = selectedSlug
		if (!slug) return
		const marker = markerBySlug.get(slug)
		if (!marker) return
		if (!marker.isPopupOpen()) marker.openPopup()
	})

	onDestroy(() => {
		for (const cleanup of popupCleanupFns) cleanup()
		popupCleanupFns = []
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
</style>
