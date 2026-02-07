<script module lang="ts">
	import {SvelteMap} from 'svelte/reactivity'

	// Track render limit per channel (persists during session)
	const channelLimits = new SvelteMap<string, number>()
</script>

<script lang="ts">
	import {page} from '$app/state'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import {getChannelTags} from '$lib/utils'
	import {processViewTracks, type View} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'

	const tracksQuery = getTracksQueryCtx()

	let searchQuery = $state('')
	let selectedTags: string[] = $state([])
	let order: View['order'] = $state('created')
	let direction: View['direction'] = $state('desc')

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let renderLimit = $derived(slug ? (channelLimits.get(slug) ?? 40) : 40)
	let aggregatedTags = $derived(getChannelTags(allTracks))
	let isSearching = $derived(searchQuery.trim() !== '' || selectedTags.length > 0)
	let isSorting = $derived(order !== 'created' || direction !== 'desc')
	let isFiltering = $derived(isSearching || isSorting)
	let filteredTracks = $derived(
		processViewTracks(allTracks, {
			tags: selectedTags.length ? selectedTags : undefined,
			tagsMode: 'all',
			search: searchQuery.trim() || undefined,
			order: isSorting ? order : undefined,
			direction: isSorting ? direction : undefined
		})
	)
	let baseTracks = $derived(isFiltering ? filteredTracks : allTracks)
	let visibleTracks = $derived(isSearching || !renderLimit ? baseTracks : baseTracks.slice(0, renderLimit))
	let hasMore = $derived(!isSearching && renderLimit && baseTracks.length > renderLimit)

	function showAll() {
		if (slug) channelLimits.set(slug, 0)
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag)
		} else {
			selectedTags = [...selectedTags, tag]
		}
	}

	function playFilteredTracks() {
		if (!filteredTracks.length) return
		const ids = filteredTracks.map((t) => t.id)
		setPlaylist(ids)
		playTrack(ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!filteredTracks.length) return
		addToPlaylist(filteredTracks.map((t) => t.id))
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		<header>
			<menu class="row">
				<SearchInput bind:value={searchQuery} placeholder="Filter tracks..." debounce={150} />
				{#if aggregatedTags.length > 0}
					<PopoverMenu>
						{#snippet trigger()}
							Tags {selectedTags.length > 0 ? `(${selectedTags.length})` : ''}
						{/snippet}
						<menu class="tags-menu">
							{#each aggregatedTags as { tag, count } (tag)}
								<button type="button" class:active={selectedTags.includes(tag)} onclick={() => toggleTag(tag)}>
									{tag} <span class="tag-count">({count})</span>
								</button>
							{/each}
						</menu>
					</PopoverMenu>
				{/if}
				{#if isFiltering}
					<small>{filteredTracks.length} selected</small>
				{/if}
				<PopoverMenu closeOnClick={false} style="margin-left: auto;">
					{#snippet trigger()}<Icon icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'} />{/snippet}
					<SortControls bind:order bind:direction />
				</PopoverMenu>
			</menu>
			{#if isFiltering}
				<menu class="row">
					{#if filteredTracks.length > 0}
						<button type="button" onclick={playFilteredTracks}>Play</button>
						<button type="button" onclick={queueFilteredTracks}>Queue</button>
					{/if}
					{#if selectedTags.length > 0}
						{#each selectedTags as tag (tag)}
							<button type="button" class="chip" onclick={() => toggleTag(tag)}>
								{tag} ×
							</button>
						{/each}
					{/if}
				</menu>
			{/if}
		</header>

		{#if tracksQuery.isReady && visibleTracks.length > 0}
			<Tracklist tracks={visibleTracks} {canEdit} grouped={!isFiltering} virtual={false} onTagClick={toggleTag} />
		{/if}

		<footer>
			{#if tracksQuery.isReady && hasMore}
				<button onclick={showAll}>Show all {baseTracks.length} tracks</button>
			{/if}

			{#if isFiltering && filteredTracks.length === 0}
				<p class="empty">No tracks match your filter</p>
			{:else if !tracksQuery.isReady && (channel.track_count ?? 0) > 0}
				<p class="empty">{m.channel_loading_tracks()}</p>
			{:else if tracksQuery.isReady && allTracks.length === 0}
				{#if canEdit}
					<p class="empty">
						<a href="/add">Add your first track</a>
					</p>
				{:else}
					<p class="empty">No tracks yet</p>
				{/if}
			{/if}
		</footer>
	</section>
{/if}

<style>
	header {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	header :global(.popover-menu > button) {
		white-space: nowrap;
	}

	header :global(input[type='search']) {
		max-width: 10rem;
	}

	.tags-menu {
		max-height: 300px;
		overflow-y: auto;
		flex-direction: column;
		gap: 0;
	}

	.tag-count {
		opacity: 0.6;
		font-size: 0.85em;
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
