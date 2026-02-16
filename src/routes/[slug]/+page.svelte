<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
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

	let searchInput = $state(page.url.searchParams.get('search') ?? '')
	let selectedTags = $derived(page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? [])
	let searchValue = $derived(page.url.searchParams.get('search') ?? '')
	let order: View['order'] = $state('created')
	let direction: View['direction'] = $state('desc')

	// Sync search input → URL (debounced by SearchInput)
	$effect(() => {
		const trimmed = searchInput.trim()
		if (trimmed === searchValue) return
		const url = new URL(page.url)
		if (trimmed) {
			url.searchParams.set('search', trimmed)
		} else {
			url.searchParams.delete('search')
		}
		goto(`${url.pathname}${url.search}`, {replaceState: true})
	})

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let aggregatedTags = $derived(getChannelTags(allTracks))
	let isSearching = $derived(searchValue !== '' || selectedTags.length > 0)
	let isSorting = $derived(order !== 'created' || direction !== 'desc')
	let isFiltering = $derived(isSearching || isSorting)
	let filteredTracks = $derived(
		processViewTracks(allTracks, {
			tags: selectedTags.length ? selectedTags : undefined,
			tagsMode: 'all',
			search: searchValue || undefined,
			order: isSorting ? order : undefined,
			direction: isSorting ? direction : undefined
		})
	)
	let visibleTracks = $derived(isFiltering ? filteredTracks : allTracks)
	let filteredPlaylistTitle = $derived.by(() => {
		const search = searchValue.trim()
		if (search) return search
		if (selectedTags.length) return selectedTags.map((tag) => `#${tag}`).join(' ')
		return ''
	})

	function toggleTag(tag: string) {
		const next = selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]
		const url = new URL(page.url)
		if (next.length) {
			url.searchParams.set('tags', next.join(','))
		} else {
			url.searchParams.delete('tags')
		}
		goto(`${url.pathname}${url.search}`, {replaceState: true})
	}

	function playFilteredTracks() {
		if (!filteredTracks.length) return
		const ids = filteredTracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: filteredPlaylistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!filteredTracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			filteredTracks.map((t) => t.id)
		)
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		<header>
			<menu class="row">
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
				<SearchInput bind:value={searchInput} placeholder="Filter tracks..." debounce={150} />
				<PopoverMenu closeOnClick={false} style="margin-left: auto;">
					{#snippet trigger()}<Icon
							icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'}
							strokeWidth={1.5}
						/>{/snippet}
					<SortControls bind:order bind:direction />
				</PopoverMenu>
			</menu>
			{#if isFiltering}
				{#if selectedTags.length > 0}
					<menu class="row filter-tags">
						{#each selectedTags as tag (tag)}
							<button type="button" class="chip" onclick={() => toggleTag(tag)}>
								{tag} ×
							</button>
						{/each}
					</menu>
				{/if}
				<menu class="row filter-actions">
					{#if filteredTracks.length > 0}
						<button type="button" onclick={playFilteredTracks}><Icon icon="play-fill" size={16} />Play</button>
						<button type="button" onclick={queueFilteredTracks}><Icon icon="next-fill" size={16} />Queue</button>
						<small class="filter-count">{filteredTracks.length} selected</small>
					{/if}
				</menu>
			{/if}
		</header>

		{#if tracksQuery.isReady && visibleTracks.length > 0}
			<Tracklist
				tracks={visibleTracks}
				playlistTitle={isFiltering ? filteredPlaylistTitle : undefined}
				{canEdit}
				grouped={!isFiltering}
				virtual={false}
				playContext={true}
				onTagClick={toggleTag}
			/>
		{/if}

		<footer>
			{#if isFiltering && tracksQuery.isReady && filteredTracks.length === 0}
				<p class="empty">No tracks match your filter</p>
			{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
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
		flex: 1;
	}

	header :global(.search-input) {
		flex: 1;
		min-width: 0;
	}

	header :global(.search-input input[type='search']) {
		width: 100%;
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

	.filter-actions {
		align-items: center;
	}

	.filter-count {
		margin-left: auto;
	}

	.filter-tags {
		flex-wrap: wrap;
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
