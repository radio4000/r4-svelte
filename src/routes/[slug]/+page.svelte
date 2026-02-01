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

	let slug = $derived(page.params.slug)
	let renderLimit = $derived(channelLimits.get(slug) ?? 40)

	// Get tracks from layout (query stays alive during navigation)
	const tracksQuery = getContext('tracksQuery')
	const getCanEdit = getContext('canEdit')

	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(getCanEdit())

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))

	// Filter state
	let searchQuery = $state('')
	let selectedTag = $state('')

	// Aggregate tags from all tracks (same pattern as tags page)
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

	// Filter pipeline: tag filter -> fuzzysort text search
	let filteredTracks = $derived.by(() => {
		let result = allTracks

		// Step 1: Filter by tag if selected
		if (selectedTag) {
			result = result.filter((track) => {
				const tags = extractHashtags(track.description || '')
				return tags.includes(selectedTag.toLowerCase())
			})
		}

		// Step 2: Fuzzy text search if query exists
		if (searchQuery.trim()) {
			result = fuzzySearch(searchQuery, result, ['title', 'description'])
		}

		return result
	})

	// Check if any filter is active
	let isFiltering = $derived(searchQuery.trim() !== '' || selectedTag !== '')

	// Apply render limit only when not filtering
	let tracks = $derived.by(() => {
		if (isFiltering) {
			return filteredTracks
		}
		return renderLimit ? allTracks.slice(0, renderLimit) : allTracks
	})

	let hasMore = $derived(!isFiltering && renderLimit && allTracks.length > renderLimit)

	function showAll() {
		channelLimits.set(slug, 0)
	}

	function openAddTrackModal() {
		appState.modal_track_add = {}
	}

	function clearFilters() {
		searchQuery = ''
		selectedTag = ''
	}

	function selectTag(tag) {
		selectedTag = tag
	}

	// Provide tag click handler context for link-entities
	setContext('tagClickHandler', selectTag)

	// Play/queue filtered tracks
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
		<!-- Filter UI -->
		<header class="row filter-bar">
			<div class="filter-controls">
				<SearchInput id="{uid}-filter" bind:value={searchQuery} placeholder="Filter tracks..." debounce={150} />
				{#if aggregatedTags.length > 0}
					<PopoverMenu id="{uid}-tags">
						{#snippet trigger()}
							{selectedTag || 'Tags'}
						{/snippet}
						<menu class="tags-menu">
							{#if selectedTag}
								<button type="button" onclick={() => selectTag('')}> Clear tag </button>
							{/if}
							{#each aggregatedTags as { tag, count } (tag)}
								<button type="button" class:active={selectedTag === tag} onclick={() => selectTag(tag)}>
									{tag} <span class="tag-count">({count})</span>
								</button>
							{/each}
						</menu>
					</PopoverMenu>
				{/if}
			</div>
			{#if isFiltering}
				<div class="filter-status">
					<span>Showing {filteredTracks.length} of {allTracks.length} tracks</span>
					{#if filteredTracks.length > 0}
						<button type="button" onclick={playFilteredTracks}>{m.search_play_all()}</button>
						<button type="button" onclick={queueFilteredTracks}>{m.search_queue_all()}</button>
					{/if}
					<button type="button" onclick={clearFilters}>Clear</button>
				</div>
			{/if}
		</header>

		{#if tracksQuery.isReady && tracks.length > 0}
			<Tracklist {tracks} {canEdit} grouped={false} virtual={false} />
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
