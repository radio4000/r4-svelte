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
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import {countStrings} from '$lib/utils'
	import {fuzzySearch} from '$lib/search'
	import type {Track} from '$lib/types'
	import * as m from '$lib/paraglide/messages'

	const tracksQuery = getTracksQueryCtx()

	let searchQuery = $state('')
	let selectedTags: string[] = $state([])

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let renderLimit = $derived(slug ? (channelLimits.get(slug) ?? 40) : 40)
	let aggregatedTags = $derived(countStrings(allTracks.flatMap((t) => t.tags ?? [])))
	let isFiltering = $derived(searchQuery.trim() !== '' || selectedTags.length > 0)
	let tagFilteredTracks = $derived(selectedTags.length ? allTracks.filter(matchesTags) : allTracks)
	let filteredTracks = $derived(
		searchQuery.trim() ? fuzzySearch(searchQuery, tagFilteredTracks, ['title', 'description']) : tagFilteredTracks
	)
	let limitedTracks = $derived(renderLimit ? allTracks.slice(0, renderLimit) : allTracks)
	let visibleTracks = $derived(isFiltering ? filteredTracks : limitedTracks)
	let hasMore = $derived(!isFiltering && renderLimit && allTracks.length > renderLimit)

	function matchesTags(track: Track) {
		const trackTags = (track.tags ?? []).map((t) => t.toLowerCase())
		return selectedTags.every((t) => trackTags.includes(t.toLowerCase()))
	}

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
		<header class="row">
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
				<menu>
					<small>Selected {filteredTracks.length}</small>
					{#if filteredTracks.length > 0}
						<button type="button" onclick={playFilteredTracks}>{m.search_play_all()}</button>
						<button type="button" onclick={queueFilteredTracks}>{m.search_queue_all()}</button>
					{/if}
				</menu>
			{/if}
		</header>

		{#if tracksQuery.isReady && visibleTracks.length > 0}
			<Tracklist tracks={visibleTracks} {canEdit} grouped={!isFiltering} virtual={false} onTagClick={toggleTag} />
		{/if}

		<footer>
			{#if tracksQuery.isReady && hasMore}
				<button onclick={showAll}>Show all {allTracks.length} tracks</button>
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
	}

	header :global(.popover-menu > button) {
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

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
