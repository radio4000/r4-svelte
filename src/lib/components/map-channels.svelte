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
	import {SvelteMap} from 'svelte/reactivity'
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
	let mountedPopups = []
	let selectedSlug = $state(/** @type {string | null} */ (null))
	/** @type {Map<string, L.CircleMarker>} */
	let markerByChannelId = new SvelteMap()
	/** @type {Map<string, L.CircleMarker>} */
	let markerBySlug = new SvelteMap()
	const followsQuery = useLiveQuery((q) => q.from({follows: followsCollection}))
	const broadcastsQuery = useLiveQuery((q) => q.from({b: broadcastsCollection}))
	const activityState = $derived.by(() => {
		void followsQuery.data
		void followsCollection.state.size
		void broadcastsCollection.state.size
		void tracksCollection.state.size
		void channelsCollection.state.size
		return deriveChannelActivityState({
			decks: appState.decks,
			tracksState: tracksCollection.state,
			channelsState: channelsCollection.state,
			followsState: followsCollection.state,
			broadcastRows: broadcastsQuery.data ?? []
		})
	})
	const favoriteIds = $derived(activityState.favoriteChannelIds)
	const broadcastingIds = $derived(activityState.broadcastingChannelIds)
	const playingSlugs = $derived(activityState.playingChannelSlugs)
	const inDeckSlugs = $derived(activityState.inDeckChannelSlugs)

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
		const isFavorite = favoriteIds.has(channel.id)
		const isBroadcasting = broadcastingIds.has(channel.id)
		const isPlaying = playingSlugs.has(channel.slug)
		const isInDeck = inDeckSlugs.has(channel.slug)
		const isActive = isBroadcasting || isPlaying || isInDeck
		const isSelected = selectedSlug === channel.slug
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

	function getStatusLabels(channel) {
		const labels = []
		if (favoriteIds.has(channel.id)) labels.push({key: 'favorite', text: 'Favorite'})
		if (broadcastingIds.has(channel.id)) labels.push({key: 'live', text: 'Live'})
		if (playingSlugs.has(channel.slug)) labels.push({key: 'playing', text: 'Playing'})
		return labels
	}

	function handleReady(m) {
		map = m
		markersLayer = L.layerGroup().addTo(map)
		updateMarkers()
	}

	function refreshMarkerStyles() {
		for (const channel of channels) {
			const marker = markerByChannelId.get(channel.id)
			if (!marker) continue
			marker.setStyle(getMarkerStyle(channel))
		}
	}

	function updateMarkers() {
		if (!markersLayer) return
		for (const mounted of mountedPopups) {
			void unmount(mounted)
		}
		mountedPopups = []
		markerByChannelId.clear()
		markerBySlug.clear()
		markersLayer.clearLayers()

		for (const c of channels) {
			if (c.latitude && c.longitude) {
				const mapHref =
					linkToMap === 'global'
						? `/?display=map&slug=${c.slug}&longitude=${c.longitude}&latitude=${c.latitude}&zoom=15`
						: linkToMap
							? `/${c.slug}/map`
							: null
				const popup = document.createElement('div')
				popup.className = 'map-popup'
				const cardRoot = document.createElement('div')
				popup.append(cardRoot)
				const card = mount(ChannelCard, {
					target: cardRoot,
					props: {channel: c, href: mapHref ?? undefined}
				})
				mountedPopups.push(card)
				const labels = untrack(() => getStatusLabels(c))
				if (labels.length) {
					const status = document.createElement('p')
					status.className = 'map-popup-status'
					status.innerHTML = labels
						.map((label) => `<span class="map-badge map-badge--${label.key}">${label.text}</span>`)
						.join(' ')
					popup.append(status)
				}

				const marker = L.circleMarker(
					[c.latitude, c.longitude],
					untrack(() => getMarkerStyle(c))
				)
					.bindPopup(popup)
					.addTo(markersLayer)
				marker.on('popupopen', () => {
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
	}

	$effect(() => {
		void channels
		void openSlug
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
		for (const mounted of mountedPopups) {
			void unmount(mounted)
		}
		mountedPopups = []
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
		width: 12rem;
	}

	:global(.map-popup h3) {
		font-size: var(--font-3);
	}

	:global(.map-popup p) {
		font-size: var(--font-2);
	}

	:global(.map-popup article h3 + p) {
		display: none;
	}

	:global(.map-popup-status) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0 0.25rem 0.25rem;
		margin: 0;
	}

	:global(.map-badge) {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		background: var(--gray-4);
		color: var(--gray-12);
		font-size: var(--font-1);
		line-height: 1.2;
	}

	:global(.map-badge--favorite) {
		background: var(--accent-4);
		color: var(--accent-11);
		border: 1px solid var(--accent-7);
	}

	:global(.map-badge--live) {
		background: var(--gray-3);
		color: var(--accent-11);
		border: 1px solid var(--accent-8);
	}

	:global(.map-badge--playing) {
		background: var(--accent-5);
		color: var(--accent-11);
		border: 1px solid var(--accent-8);
	}

	:global(.leaflet-popup-content-wrapper),
	:global(.leaflet-popup-tip) {
		background: var(--gray-1);
		color: var(--gray-12);
		box-shadow: var(--shadow-modal);
	}
</style>
