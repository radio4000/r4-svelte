<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {shuffleArray} from '$lib/utils.ts'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import InfiniteGrid from './infinite-grid.svelte'
	import MapComponent from './map.svelte'
	import SpectrumScanner from './spectrum-scanner.svelte'

	const {channels = [], slug: initialSlug, display: initialDisplay, longitude, latitude, zoom} = $props()

	let limit = $state(30)
	let perPage = $state(100)
	let filter = $derived(appState.channels_filter || '20+')
	let shuffled = $derived(appState.channels_shuffled ?? true)

	/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'}*/
	let display = $derived(appState.channels_display || initialDisplay || 'grid')

	/*
	const channelsPromise = $derived.by(
		async () => (await pg.sql`SELECT * FROM channels ORDER BY created_at DESC`).rows
	)*/

	const realChannels = $derived.by(() => processChannels())

	function filterChannels() {
		return channels.filter((c) => {
			if (filter === 'all') return true
			if (filter === 'v1') return c.source === 'v1'
			if (filter === 'v2') return c.source !== 'v1'
			if (filter === 'artwork' && !c.image) return false
			if (filter === '20+' && (!c.track_count || c.track_count < 20)) return false
			if (filter === '100+' && (!c.track_count || c.track_count < 100)) return false
			if (filter === '1000+' && (!c.track_count || c.track_count < 1000)) return false
			return true
		})
	}

	function processChannels() {
		const filtered = filterChannels()
		const processed = shuffled ? shuffleArray([...filtered]) : filtered
		return {
			filtered,
			displayed: processed.slice(0, limit),
			mapMarkers: channels
				.filter((c) => c.longitude && c.latitude)
				.map(({longitude, latitude, slug, name}) => ({
					longitude,
					latitude,
					title: name,
					href: slug,
					isActive: slug === initialSlug
				}))
		}
	}

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

	function toggleShuffle() {
		appState.channels_shuffled = !appState.channels_shuffled
	}

	function handleMapChange({latitude, longitude, zoom}) {
		const query = new URL(page.url).searchParams
		query.set('latitude', latitude)
		query.set('longitude', longitude)
		query.set('zoom', zoom)
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}
</script>

{#snippet displayBtn(prop, icon)}
	<button
		{@attach tooltip({content: `View as ${prop}`})}
		class:active={display === prop}
		onclick={() => setDisplay(prop)}
	>
		<Icon {icon} />
	</button>
{/snippet}

<div class={`layout layout--${display}`}>
	<menu class="filtermenu">
		<div class="filters">
			<label title="Channel filter">
				<select value={filter} onchange={(e) => setFilter(e.target.value)}>
					<option value="all">All</option>
					<option value="20+">20+ tracks</option>
					<option value="100+">100+ tracks</option>
					<option value="1000+">1000+ tracks</option>
					<option value="artwork">Has artwork</option>
					<option value="v1">v1</option>
					<option value="v2">v2</option>
				</select>
			</label>
			<button title="Show random channels" class:active={appState.channels_shuffled} onclick={toggleShuffle}>
				<Icon icon="shuffle" />
			</button>
		</div>
		<div class="display">
			{@render displayBtn('grid', 'grid')}
			{@render displayBtn('list', 'unordered-list')}
			{@render displayBtn('map', 'map')}
			{@render displayBtn('tuner', 'radio')}
			{@render displayBtn('infinite', 'infinite')}
		</div>
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
					Showing {realChannels.displayed.length} of {realChannels.filtered.length} channels.
					{#if realChannels.displayed.length < realChannels.filtered.length}
						<button onclick={() => (limit = limit + perPage)}>Load {perPage} more</button>
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
		justify-content: space-between;
		margin: 0.5rem 0.5rem 1rem;
		gap: 0.2rem;
		z-index: 1;

		.filters,
		.display {
			display: flex;
			align-items: center;
			gap: 0.2rem;
		}

		label {
			user-select: none;
			display: flex;
			align-items: center;
			gap: 0.3rem;
		}
	}

	.filtermenu :global(svg) {
		width: var(--font-5);
		margin-right: 0.2em;
	}

	footer p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 2rem 0 10rem 0.5rem;
	}
</style>
