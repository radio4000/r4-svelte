<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {shufflePlayChannel} from '$lib/api'
	import {shuffleArray, channelAvatarUrl} from '$lib/utils.ts'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'
	import SpectrumScanner from './spectrum-scanner.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const {channels = [], display: initialDisplay} = $props()

	const activeChannelId = $derived.by(() => {
		if (appState.listening_to_channel_id) return appState.listening_to_channel_id
		const trackId = appState.playlist_track
		if (!trackId) return
		const track = tracksCollection.state.get(trackId)
		if (!track?.slug) return
		const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
		return channel?.id
	})

	let shuffleSeed = $state(0)
	let limit = $state(16)
	let perPage = $state(100)
	let filter = $derived(appState.channels_filter || '10+')
	let order = $derived(appState.channels_order || 'shuffle')
	let orderDirection = $derived(appState.channels_order_direction)

	/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'}*/
	let display = $derived(appState.channels_display || initialDisplay || 'grid')

	const filteredChannels = $derived(
		channels.filter((c) => {
			if (filter === 'all') return true
			if (filter === 'v1') return c.source === 'v1'
			if (filter === 'v2') return c.source !== 'v1'
			if (filter === 'artwork' && (!c.image || !c.track_count || c.track_count < 2)) return false
			if (filter === '10+' && (!c.track_count || c.track_count < 10)) return false
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
		order === 'shuffle'
			? filteredChannels
			: [...filteredChannels]
					.filter((c) => order !== 'updated' || c.latest_track_at)
					.sort((a, b) => {
						const av = sortKey[order](a)
						const bv = sortKey[order](b)
						const cmp = av < bv ? -1 : av > bv ? 1 : 0
						return orderDirection === 'asc' ? cmp : -cmp
					})
	)

	const orderedChannels = $derived.by(() => {
		if (order === 'shuffle') {
			void shuffleSeed
			return shuffleArray([...sortedChannels])
		}
		return sortedChannels
	})

	const realChannels = $derived({
		filtered: filteredChannels,
		displayed: orderedChannels.slice(0, limit)
	})

	const canvasMedia = $derived(
		orderedChannels.map((c) => ({
			url: c.image
				? channelAvatarUrl(c.image)
				: `https://placehold.co/250?text=${encodeURIComponent(c.name?.[0] || '?')}`,
			width: 250,
			height: 250,
			slug: c.slug,
			id: c.id,
			name: c.name
		}))
	)

	const openSlug = $derived(page.url.searchParams.get('slug'))

	function handleCanvasClick(item) {
		if (!item.slug || !item.id) return
		shufflePlayChannel({id: item.id, slug: item.slug})
	}

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

	const viewIconMap = {
		grid: 'grid',
		list: 'unordered-list',
		map: 'map',
		tuner: 'radio',
		infinite: 'infinite'
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
		'10+': () => m.channels_filter_option_10(),
		'100+': () => m.channels_filter_option_100(),
		'1000+': () => m.channels_filter_option_1000(),
		artwork: () => m.channels_filter_option_artwork(),
		v1: () => m.channels_filter_option_v1(),
		v2: () => m.channels_filter_option_v2()
	}
</script>

<div class={`layout layout--${display}`}>
	<menu class="filtermenu">
		<PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}<Icon icon="filter-alt" /> {filterLabelMap[filter]()}{/snippet}
			<menu data-vertical>
				<button
					class:active={filter === 'all'}
					onclick={() => setFilter('all')}
					{@attach tooltip({content: m.channels_filter_tooltip_all(), position: 'right'})}
					>{m.channels_filter_option_all()}</button
				>
				<button
					class:active={filter === '10+'}
					onclick={() => setFilter('10+')}
					{@attach tooltip({content: m.channels_filter_tooltip_10(), position: 'right'})}
					>{m.channels_filter_option_10()}</button
				>
				<button
					class:active={filter === '100+'}
					onclick={() => setFilter('100+')}
					{@attach tooltip({content: m.channels_filter_tooltip_100(), position: 'right'})}
					>{m.channels_filter_option_100()}</button
				>
				<button
					class:active={filter === '1000+'}
					onclick={() => setFilter('1000+')}
					{@attach tooltip({content: m.channels_filter_tooltip_1000(), position: 'right'})}
					>{m.channels_filter_option_1000()}</button
				>
				<button
					class:active={filter === 'artwork'}
					onclick={() => setFilter('artwork')}
					{@attach tooltip({content: m.channels_filter_tooltip_artwork(), position: 'right'})}
					>{m.channels_filter_option_artwork()}</button
				>
				<button
					class:active={filter === 'v1'}
					onclick={() => setFilter('v1')}
					{@attach tooltip({content: m.channels_filter_tooltip_v1(), position: 'right'})}
					>{m.channels_filter_option_v1()}</button
				>
				<button
					class:active={filter === 'v2'}
					onclick={() => setFilter('v2')}
					{@attach tooltip({content: m.channels_filter_tooltip_v2(), position: 'right'})}
					>{m.channels_filter_option_v2()}</button
				>
			</menu>
		</PopoverMenu>

		<PopoverMenu
			id="channels-display"
			closeOnClick={false}
			style="margin-left: auto;"
			triggerAttachment={tooltip({content: m.channels_view_mode({mode: viewLabelMap[display]()})})}
		>
			{#snippet trigger()}<Icon icon={viewIconMap[display]} strokeWidth={1.7} />
				{viewLabelMap[display]()}{/snippet}
			<div class="view-modes">
				<button
					class:active={display === 'grid'}
					onclick={() => setDisplay('grid')}
					{@attach tooltip({content: m.channels_tooltip_grid()})}
					><Icon icon="grid" strokeWidth={1.7} /><small>{m.channels_view_label_grid()}</small></button
				>
				<button
					class:active={display === 'list'}
					onclick={() => setDisplay('list')}
					{@attach tooltip({content: m.channels_tooltip_list()})}
					><Icon icon="unordered-list" /><small>{m.channels_view_label_list()}</small></button
				>
				<button
					class:active={display === 'map'}
					onclick={() => setDisplay('map')}
					{@attach tooltip({content: m.channels_tooltip_map()})}
					><Icon icon="map" strokeWidth={1.7} /><small>{m.channels_view_label_map()}</small></button
				>
				<button
					class:active={display === 'tuner'}
					onclick={() => setDisplay('tuner')}
					{@attach tooltip({content: m.channels_tooltip_tuner()})}
					><Icon icon="radio" /><small>{m.channels_view_label_tuner()}</small></button
				>
				<button
					class:active={display === 'infinite'}
					onclick={() => setDisplay('infinite')}
					{@attach tooltip({content: m.channels_tooltip_infinite()})}
					><Icon icon="infinite" /><small>{m.channels_view_label_infinite()}</small></button
				>
			</div>
			<SortControls
				bind:order={appState.channels_order}
				bind:direction={appState.channels_order_direction}
				onreshuffle={() => shuffleSeed++}
			/>
		</PopoverMenu>
	</menu>

	{#if display === 'map'}
		{#await import('./map-channels.svelte') then MapChannels}
			<MapChannels.default {channels} {openSlug} />
		{/await}
	{:else if display === 'tuner'}
		<SpectrumScanner channels={realChannels.filtered} />
	{:else if display === 'infinite'}
		{#await import('./infinite-canvas.svelte') then InfiniteCanvas}
			<InfiniteCanvas.default media={canvasMedia} activeId={activeChannelId} onclick={handleCanvasClick} />
		{/await}
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
		&.layout--map,
		&.layout--infinite {
			display: flex;
			flex-direction: column;
			flex-grow: 1;
		}
		&.layout--infinite :global(.canvas-wrapper) {
			flex: 1;
		}
		&.layout--infinite .filtermenu,
		&.layout--map .filtermenu {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			z-index: 1000;
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
			min-width: 3.5rem;

			small {
				color: inherit;
			}
		}
	}

	footer p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 2rem 0.5rem 1rem;
	}
</style>
