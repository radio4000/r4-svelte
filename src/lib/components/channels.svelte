<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {shuffleArray} from '$lib/utils.ts'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import InfiniteGrid from './infinite-grid.svelte'
	import MapComponent from './map.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SpectrumScanner from './spectrum-scanner.svelte'
	import * as m from '$lib/paraglide/messages'

	const {channels = [], slug: initialSlug, display: initialDisplay, longitude, latitude, zoom} = $props()

	let limit = $state(18)
	let perPage = $state(100)
	let filter = $derived(appState.channels_filter || '20+')
	let shuffled = $derived(appState.channels_shuffled ?? true)
	let order = $derived(appState.channels_order)
	let orderDirection = $derived(appState.channels_order_direction)

	/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'}*/
	let display = $derived(appState.channels_display || initialDisplay || 'grid')

	/*
	const channelsPromise = $derived.by(
		async () => (await pg.sql`SELECT * FROM channels ORDER BY created_at DESC`).rows
	)*/

	const filteredChannels = $derived(
		channels.filter((c) => {
			if (filter === 'all') return true
			if (filter === 'v1') return c.source === 'v1'
			if (filter === 'v2') return c.source !== 'v1'
			if (filter === 'artwork' && !c.image) return false
			if (filter === '20+' && (!c.track_count || c.track_count < 20)) return false
			if (filter === '100+' && (!c.track_count || c.track_count < 100)) return false
			if (filter === '1000+' && (!c.track_count || c.track_count < 1000)) return false
			return true
		})
	)

	const sortKey = {
		updated: (c) => c.latest_track_at ?? '',
		created: (c) => c.created_at ?? '',
		name: (c) => c.name?.toLowerCase() ?? '',
		tracks: (c) => c.track_count ?? 0
	}

	const sortedChannels = $derived(
		[...filteredChannels]
			.filter((c) => order !== 'updated' || c.latest_track_at)
			.sort((a, b) => {
				const av = sortKey[order](a)
				const bv = sortKey[order](b)
				const cmp = av < bv ? -1 : av > bv ? 1 : 0
				return orderDirection === 'asc' ? cmp : -cmp
			})
	)

	const orderedChannels = $derived(shuffled ? shuffleArray([...sortedChannels]) : sortedChannels)

	const realChannels = $derived({
		filtered: filteredChannels,
		displayed: orderedChannels.slice(0, limit),
		mapMarkers: channels
			.filter((c) => c.longitude && c.latitude)
			.map(({longitude, latitude, slug, name}) => ({
				longitude,
				latitude,
				title: name,
				href: slug,
				isActive: slug === initialSlug
			}))
	})

	/** @param {'grid' | 'list' | 'map' | 'tuner' | 'infinite'} value */
	function setDisplay(value = 'grid') {
		display = value
		appState.channels_display = display
		const query = new URL(page.url).searchParams
		query.set('display', display)
		// Preserve map params if switching to map view
		if (value !== 'map') {
			query.delete('latitude')
			query.delete('longitude')
			query.delete('zoom')
		}
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	function setFilter(value) {
		appState.channels_filter = value
	}

	function setOrder(value) {
		appState.channels_order = value
		appState.channels_shuffled = false
	}

	function toggleShuffle() {
		appState.channels_shuffled = !appState.channels_shuffled
	}

	function toggleOrderDirection() {
		appState.channels_order_direction = orderDirection === 'asc' ? 'desc' : 'asc'
		appState.channels_shuffled = false
	}

	function handleMapChange({latitude, longitude, zoom}) {
		const query = new URL(page.url).searchParams
		query.set('latitude', latitude)
		query.set('longitude', longitude)
		query.set('zoom', zoom)
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	const viewLabelMap = {
		grid: () => m.channels_view_label_grid(),
		list: () => m.channels_view_label_list(),
		map: () => m.channels_view_label_map(),
		tuner: () => m.channels_view_label_tuner(),
		infinite: () => m.channels_view_label_infinite()
	}

	const filterLabelMap = {
		all: () => m.channels_filter_option_all(),
		'20+': () => m.channels_filter_option_20(),
		'100+': () => m.channels_filter_option_100(),
		'1000+': () => m.channels_filter_option_1000(),
		artwork: () => m.channels_filter_option_artwork(),
		v1: () => m.channels_filter_option_v1(),
		v2: () => m.channels_filter_option_v2()
	}
</script>

<div class={`layout layout--${display}`}>
	<menu class="filtermenu">
		<PopoverMenu id="channels-filter">
			{#snippet trigger()}<Icon icon="filter-alt" size="20" /> {filterLabelMap[filter]()}{/snippet}
			<button class:active={filter === 'all'} onclick={() => setFilter('all')}>{m.channels_filter_option_all()}</button>
			<button class:active={filter === '20+'} onclick={() => setFilter('20+')}>{m.channels_filter_option_20()}</button>
			<button class:active={filter === '100+'} onclick={() => setFilter('100+')}
				>{m.channels_filter_option_100()}</button
			>
			<button class:active={filter === '1000+'} onclick={() => setFilter('1000+')}
				>{m.channels_filter_option_1000()}</button
			>
			<button class:active={filter === 'artwork'} onclick={() => setFilter('artwork')}
				>{m.channels_filter_option_artwork()}</button
			>
			<button class:active={filter === 'v1'} onclick={() => setFilter('v1')}>{m.channels_filter_option_v1()}</button>
			<button class:active={filter === 'v2'} onclick={() => setFilter('v2')}>{m.channels_filter_option_v2()}</button>
		</PopoverMenu>

		<PopoverMenu id="channels-display" closeOnClick={false}>
			{#snippet trigger()}<Icon icon="grid" size="20" /> {viewLabelMap[display]()}{/snippet}
			<div class="view-modes">
				<button class:active={display === 'grid'} onclick={() => setDisplay('grid')}
					><Icon icon="grid" size="20" /><small>{m.channels_view_label_grid()}</small></button
				>
				<button class:active={display === 'list'} onclick={() => setDisplay('list')}
					><Icon icon="unordered-list" size="20" /><small>{m.channels_view_label_list()}</small></button
				>
				<button class:active={display === 'map'} onclick={() => setDisplay('map')}
					><Icon icon="map" size="20" /><small>{m.channels_view_label_map()}</small></button
				>
				<button class:active={display === 'tuner'} onclick={() => setDisplay('tuner')}
					><Icon icon="radio" size="20" /><small>{m.channels_view_label_tuner()}</small></button
				>
				<button class:active={display === 'infinite'} onclick={() => setDisplay('infinite')}
					><Icon icon="infinite" size="20" /><small>{m.channels_view_label_infinite()}</small></button
				>
			</div>
			<button class:active={order === 'updated'} onclick={() => setOrder('updated')}
				>{m.channels_order_updated()}</button
			>
			<button class:active={order === 'created'} onclick={() => setOrder('created')}
				>{m.channels_order_created()}</button
			>
			<button class:active={order === 'name'} onclick={() => setOrder('name')}>{m.channels_order_name()}</button>
			<button class:active={order === 'tracks'} onclick={() => setOrder('tracks')}>{m.channels_order_tracks()}</button>
			<hr />
			<button onclick={toggleOrderDirection}>
				<Icon icon={orderDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size="20" />
				{orderDirection === 'asc' ? m.channels_order_asc() : m.channels_order_desc()}
			</button>
			<button class:active={appState.channels_shuffled} onclick={toggleShuffle}>
				<Icon icon="shuffle" size="20" />
				{m.channels_shuffle_tooltip()}
			</button>
		</PopoverMenu>
	</menu>

	{#if display === 'map'}
		{#if realChannels.mapMarkers}
			<MapComponent
				urlMode
				markers={realChannels.mapMarkers}
				{latitude}
				{longitude}
				{zoom}
				onmapchange={handleMapChange}
			></MapComponent>
		{/if}
	{:else if display === 'tuner'}
		<SpectrumScanner channels={realChannels.filtered} />
	{:else if display === 'infinite'}
		<InfiniteGrid channels={realChannels.filtered} />
	{:else}
		<ol class={display}>
			{#each realChannels.displayed as channel (channel.id)}
				<li>
					<ChannelCard {channel} />
				</li>
			{/each}
		</ol>
		<footer>
			{#if realChannels.displayed?.length > 0}
				<p>
					{m.channels_summary({
						visible: realChannels.displayed.length,
						total: realChannels.filtered.length
					})}
					{#if realChannels.displayed.length < realChannels.filtered.length}
						<button onclick={() => (limit = limit + perPage)}>{m.channels_load_more({count: perPage})}</button>
					{/if}
				</p>
			{/if}
		</footer>
	{/if}
</div>

<style>
	.layout {
		position: relative;
		&.layout--map {
			display: flex;
			flex-direction: column;
			flex-grow: 1;
		}
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0.5rem 1rem;
		z-index: 1;
	}

	.view-modes {
		display: flex;
		gap: 0.2rem;
		padding-bottom: 0.5rem;
		margin-bottom: 0.2rem;
		border-bottom: 1px solid var(--gray-6);

		button {
			flex: 1;
			flex-direction: column;
			gap: 0.2rem;
			padding: 0.2rem;
			min-width: 3rem;

			small {
				color: initial;
			}
		}
	}

	footer p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 2rem 0 10rem 0.5rem;
	}
</style>
