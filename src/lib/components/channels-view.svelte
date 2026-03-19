<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	const channelActivity = $derived(getChannelActivity())
	import {toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {handleCanvasClick as onCanvasClick, handleCanvasDoubleClick} from '$lib/components/channels-view-shared.js'
	import ChannelCard from './channel-card.svelte'
	import ChannelsViewControls from './channels-view-controls.svelte'

	/** @type {{channels?: any[], order?: string, direction?: 'asc' | 'desc', display?: 'grid' | 'list' | 'map' | 'infinite', header?: import('svelte').Snippet, showToolbar?: boolean, syncToUrl?: boolean}} */
	let {
		channels = [],
		order = $bindable('updated'),
		direction = $bindable('desc'),
		display = $bindable('grid'),
		header = undefined,
		showToolbar = true,
		syncToUrl = false
	} = $props()

	const openSlug = $derived(syncToUrl ? page.url.searchParams.get('slug') : null)
	const activeIds = $derived(channelActivity.activeChannelIds)
	const activeId = $derived(activeIds[0] ?? undefined)

	const sortKey = {
		updated: (c) => c.latest_track_at || c.updated_at || '',
		created: (c) => c.created_at || '',
		name: (c) => c.name?.toLowerCase() || '',
		tracks: (c) => c.track_count || 0
	}

	let sortedChannels = $derived(
		order === 'shuffle'
			? channels.toSorted(() => Math.random() - 0.5)
			: channels.toSorted((a, b) => {
					const by = sortKey[order] ?? sortKey.updated
					const av = by(a)
					const bv = by(b)
					const cmp = av < bv ? -1 : av > bv ? 1 : 0
					return direction === 'asc' ? cmp : -cmp
				})
	)

	const canvasMedia = $derived(sortedChannels.map((c) => toChannelCardMedia(c, channelActivity)))

	let selectedCanvasChannelId = $state(/** @type {string | null} */ (null))

	$effect(() => {
		if (!openSlug || !sortedChannels.length) return
		const match = sortedChannels.find((c) => c.slug === openSlug)
		if (match?.id) selectedCanvasChannelId = match.id
	})

	function handleCanvasClick(item) {
		onCanvasClick(item, (id) => (selectedCanvasChannelId = id))
	}

	/** @param {'grid' | 'list' | 'map' | 'infinite'} value */
	function setDisplay(value) {
		display = value
		if (syncToUrl) {
			const query = new URL(page.url).searchParams
			query.set('display', display)
			if (value !== 'map') {
				query.delete('latitude')
				query.delete('longitude')
				query.delete('zoom')
			}
			goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
		}
	}
</script>

<div class={`layout layout--${display} fill-height`}>
	{#if showToolbar}
		<header class="row toolbar">
			{#if header}{@render header()}{/if}
			<ChannelsViewControls bind:display bind:order bind:direction {setDisplay} />
		</header>
	{/if}

	{#if display === 'map'}
		{#await import('./map-channels.svelte') then MapChannels}
			<MapChannels.default channels={sortedChannels} {openSlug} />
		{/await}
	{:else if display === 'infinite'}
		{@const InfiniteCanvas = (await import('./infinite-canvas-ogl.svelte')).default}
		<InfiniteCanvas
			media={canvasMedia}
			{activeId}
			{activeIds}
			selectedId={selectedCanvasChannelId}
			focusSlug={openSlug}
			focusKey={openSlug}
			onclick={handleCanvasClick}
			ondoubleclick={handleCanvasDoubleClick}
		/>
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
		display: flex;
		flex-direction: column;
		&.layout--infinite :global(.canvas-wrapper) {
			flex: 1;
		}
		&.layout--map .toolbar,
		&.layout--infinite .toolbar {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			/* Default page controls layer: above content, below app overlays/fullscreen deck. */
			z-index: 3;
		}
	}

	.toolbar {
		align-items: center;
		justify-content: space-between;
		margin: 0.5rem 0.5rem 1rem;

		:global(h1, h2, h3) {
			margin: 0;
		}
	}
</style>
