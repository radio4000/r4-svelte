<script module>
	import {SvelteMap} from 'svelte/reactivity'
	// Track render limit per channel (persists during session)
	const channelLimits = new SvelteMap()
</script>

<script>
	import {page} from '$app/state'
	import {getContext, setContext} from 'svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import {appState} from '$lib/app-state.svelte'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import {extractHashtags} from '$lib/utils'
	import {fuzzySearch} from '$lib/search'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()
	const tracksQuery = getContext('tracksQuery')
	const getCanEdit = getContext('canEdit')

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))

	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(getCanEdit())
	let renderLimit = $derived(channelLimits.get(slug) ?? 40)

	let searchQuery = $state('')
	/** @type {string[]} */
	let selectedTags = $state([])

	let aggregatedTags = $derived.by(() => {
		const counts = {}
		for (const track of allTracks) {
			for (const tag of extractHashtags(track.description || '')) {
				counts[tag] = (counts[tag] || 0) + 1
			}
		}
		return Object.entries(counts)
			.map(([tag, count]) => ({tag, count}))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
	})

	let isFiltering = $derived(searchQuery.trim() !== '' || selectedTags.length > 0)

	function matchesTags(track) {
		const trackTags = extractHashtags(track.description || '')
		return selectedTags.every((t) => trackTags.includes(t.toLowerCase()))
	}

	let tagFilteredTracks = $derived(selectedTags.length ? allTracks.filter(matchesTags) : allTracks)
	let filteredTracks = $derived(
		searchQuery.trim() ? fuzzySearch(searchQuery, tagFilteredTracks, ['title', 'description']) : tagFilteredTracks
	)

	let visibleTracks = $derived(isFiltering ? filteredTracks : renderLimit ? allTracks.slice(0, renderLimit) : allTracks)
	let hasMore = $derived(!isFiltering && renderLimit && allTracks.length > renderLimit)

	function showAll() {
		channelLimits.set(slug, 0)
	}

	function openAddTrackModal() {
		appState.modal_track_add = {}
	}

	function toggleTag(tag) {
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

	setContext('tagClickHandler', toggleTag)
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		<!-- Filter UI -->
		<header class="row filter-bar">
			<div class="filter-controls">
				<SearchInput id="{uid}-filter" bind:value={searchQuery} placeholder="Filter tracks..." debounce={150} />
				{#if aggregatedTags.length > 0}
					<PopoverMenu id="{uid}-tags">
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
			</div>
			{#if selectedTags.length > 0}
				<menu>
					{#each selectedTags as tag (tag)}
						<button type="button" class="chip" onclick={() => toggleTag(tag)}>
							{tag} ×
						</button>
					{/each}
				</menu>
			{/if}
			{#if isFiltering}
				<div class="filter-status">
					<small>Selected {filteredTracks.length}</small>
					{#if filteredTracks.length > 0}
						<button type="button" onclick={playFilteredTracks}>{m.search_play_all()}</button>
						<button type="button" onclick={queueFilteredTracks}>{m.search_queue_all()}</button>
					{/if}
				</div>
			{/if}
		</header>

		{#if tracksQuery.isReady && visibleTracks.length > 0}
			<Tracklist tracks={visibleTracks} {canEdit} grouped={isFiltering ? false : true} virtual={false} />
			{#if hasMore}
				<footer>
					<button onclick={showAll}>Show all {allTracks.length} tracks</button>
				</footer>
			{/if}
		{:else if isFiltering && filteredTracks.length === 0}
			<p class="empty">No tracks match your filter</p>
		{:else if (channel.track_count ?? 0) > 0}
			<p class="empty">{m.channel_loading_tracks()}</p>
		{:else if canEdit}
			<p class="empty">
				No tracks yet.
				<button onclick={openAddTrackModal}>Add your first track</button>
			</p>
		{:else}
			<p class="empty">No tracks yet</p>
		{/if}
	</section>
{/if}

<style>
	.filter-bar {
		padding: 0.5rem;
	}

	.filter-controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.filter-controls :global(.popover-menu > button) {
		white-space: nowrap;
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

	.filter-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--font--1);
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
