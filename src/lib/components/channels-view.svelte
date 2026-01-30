<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {shufflePlayChannel} from '$lib/api'
	import {channelAvatarUrl} from '$lib/utils.ts'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import MapChannels from './map-channels.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import * as m from '$lib/paraglide/messages'

	let {channels = [], order = $bindable('updated'), direction = $bindable('desc'), header} = $props()

	/** @type {'grid' | 'list' | 'map' | 'infinite'} */
	let display = $state('grid')

	const sortKey = {
		updated: (c) => c.latest_track_at || c.updated_at || '',
		created: (c) => c.created_at || '',
		name: (c) => c.name?.toLowerCase() || '',
		tracks: (c) => c.track_count || 0
	}

	let sortedChannels = $derived(
		[...channels].sort((a, b) => {
			const av = sortKey[order](a)
			const bv = sortKey[order](b)
			const cmp = av < bv ? -1 : av > bv ? 1 : 0
			return direction === 'asc' ? cmp : -cmp
		})
	)

	const canvasMedia = $derived(
		sortedChannels.map((c) => ({
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

	function handleCanvasClick(item) {
		if (!item.slug || !item.id) return
		shufflePlayChannel({id: item.id, slug: item.slug})
	}

	/** @param {'grid' | 'list' | 'map' | 'infinite'} value */
	function setDisplay(value) {
		display = value
		const query = new URL(page.url).searchParams
		query.set('display', display)
		if (value !== 'map') {
			query.delete('latitude')
			query.delete('longitude')
			query.delete('zoom')
		}
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	const viewIconMap = {
		grid: 'grid',
		list: 'unordered-list',
		map: 'map',
		infinite: 'infinite'
	}

	const viewLabelMap = {
		grid: () => m.channels_view_label_grid(),
		list: () => m.channels_view_label_list(),
		map: () => m.channels_view_label_map(),
		infinite: () => m.channels_view_label_infinite()
	}
</script>

<div class={`layout layout--${display}`}>
	<header class="toolbar">
		{#if header}{@render header()}{/if}
		<PopoverMenu
			id="channels-view"
			closeOnClick={false}
			triggerAttachment={tooltip({content: m.channels_view_mode({mode: viewLabelMap[display]()})})}
		>
			{#snippet trigger()}<Icon icon={viewIconMap[display]} size="20" strokeWidth={1.7} />
				{viewLabelMap[display]()}{/snippet}
			<div class="view-modes">
				<button
					class:active={display === 'grid'}
					onclick={() => setDisplay('grid')}
					{@attach tooltip({content: m.channels_tooltip_grid()})}
				>
					<Icon icon="grid" size="20" strokeWidth={1.7} /><small>{m.channels_view_label_grid()}</small>
				</button>
				<button
					class:active={display === 'list'}
					onclick={() => setDisplay('list')}
					{@attach tooltip({content: m.channels_tooltip_list()})}
				>
					<Icon icon="unordered-list" size="20" /><small>{m.channels_view_label_list()}</small>
				</button>
				<button
					class:active={display === 'map'}
					onclick={() => setDisplay('map')}
					{@attach tooltip({content: m.channels_tooltip_map()})}
				>
					<Icon icon="map" size="20" strokeWidth={1.7} /><small>{m.channels_view_label_map()}</small>
				</button>
				<button
					class:active={display === 'infinite'}
					onclick={() => setDisplay('infinite')}
					{@attach tooltip({content: m.channels_tooltip_infinite()})}
				>
					<Icon icon="infinite" size="20" /><small>{m.channels_view_label_infinite()}</small>
				</button>
			</div>
			<SortControls bind:order bind:direction />
		</PopoverMenu>
	</header>

	{#if display === 'map'}
		<MapChannels channels={sortedChannels} />
	{:else if display === 'infinite'}
		{@const InfiniteCanvas = (await import('./infinite-canvas.svelte')).default}
		<InfiniteCanvas media={canvasMedia} onclick={handleCanvasClick} />
	{:else}
		<ol class={display}>
			{#each sortedChannels as channel (channel.id)}
				<li>
					<ChannelCard {channel} />
				</li>
			{/each}
		</ol>
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
			min-height: 70vh;
		}
		&.layout--infinite :global(.canvas-wrapper) {
			flex: 1;
		}
		&.layout--map .toolbar,
		&.layout--infinite .toolbar {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			z-index: 1000;
		}
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0 0 1rem;

		:global(h1, h2, h3) {
			margin: 0;
		}

		:global(h1 small) {
			font-size: 0.6em;
			opacity: 0.7;
		}
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
</style>
