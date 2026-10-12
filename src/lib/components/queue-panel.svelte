<script>
	import {fuzzySearch} from '$lib/utils'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {clearQueue, clearAllQueue, playTrack} from '$lib/api'
	import {getActiveQueue} from '$lib/player/queue'
	import SearchInput from './search-input.svelte'
	import FilterChips from './filter-chips.svelte'
	import Icon from './icon.svelte'
	import Tracklist from './tracklist.svelte'
	import {tick} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId: number, scrollToActive?: (() => void) | undefined}} */
	// Write-only bindable: the parent calls it, so the destructure itself is never read here.
	// eslint-disable-next-line no-useless-assignment
	let {deckId, scrollToActive = $bindable()} = $props()

	let deck = $derived(appState.decks[deckId])

	let searchQuery = $state('')
	/** @type {string[]} */
	let selectedTags = $state([])
	let selectedTrackId = $state(/** @type {string | null} */ (null))
	/** @type {any} */
	let tracklist = $state()

	async function doScrollToActive() {
		if (!deck?.playlist_track) return

		// If the active track is filtered out, clear the filters so it appears
		if (
			(searchQuery || selectedTags.length) &&
			!filteredQueueTracks.some((t) => t.id === deck?.playlist_track)
		) {
			searchQuery = ''
			selectedTags = []
			await tick()
		}

		const idx = filteredQueueTracks.findIndex((t) => t.id === deck?.playlist_track)
		if (idx >= 0) tracklist?.scrollToItem(idx)
	}

	$effect(() => {
		scrollToActive = doScrollToActive
	})

	// Lists what will play: the results subset while one is active.
	let trackIds = $derived(getActiveQueue(deck))
	let isFiltering = $derived(searchQuery !== '' || selectedTags.length > 0)

	// Resolve tracks by id in playlist order. An inArray() live query would rebuild a
	// d2ts pipeline (~1.2s block) over a large playlist; these Map lookups are O(1).
	// Reading tracksLive.data re-runs this on any track change, so edits and
	// late-loading rows appear. See docs/tanstack.md.
	const tracksLive = useLiveQuery(tracksCollection)
	let queueTracks = $derived.by(() => {
		void tracksLive.data.length
		const state = tracksCollection.state
		return trackIds.map((id) => state.get(id)).filter((t) => !!t)
	})

	let searchedQueueTracks = $derived(
		fuzzySearch(searchQuery, queueTracks, ['title', 'tags', 'description'])
	)
	let filteredQueueTracks = $derived(
		selectedTags.length
			? searchedQueueTracks.filter((t) => selectedTags.every((tag) => t.tags?.includes(tag)))
			: searchedQueueTracks
	)

	/** @param {string} tag */
	function toggleTag(tag) {
		selectedTags = selectedTags.includes(tag)
			? selectedTags.filter((t) => t !== tag)
			: [...selectedTags, tag]
	}

	function playResults() {
		if (!deck || !filteredQueueTracks.length) return
		const ids = filteredQueueTracks.map((track) => track.id)
		deck.playlist_tracks_filtered = ids
		const current = deck.playlist_track
		playTrack(deckId, current && ids.includes(current) ? current : ids[0], null, 'user_click_track')
	}

	function clearFilters() {
		searchQuery = ''
		selectedTags = []
		if (deck) deck.playlist_tracks_filtered = undefined
	}

	/** @param {import('$lib/types').Track} track */
	function canEditTrack(track) {
		const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
		return canEditChannel(channel?.id)
	}

	function handleClearQueue() {
		if (deck?.is_playing) {
			clearQueue(deckId)
		} else {
			clearAllQueue(deckId)
		}
	}
</script>

<div class="queue-panel">
	<div class="search-container">
		<SearchInput
			bind:value={searchQuery}
			placeholder={`${m.search_placeholder()} (${queueTracks.length})`}
			debounce={150}
		/>
		{#if isFiltering && filteredQueueTracks.length > 0}
			<button onclick={playResults} {@attach tooltip({content: m.search_play_all()})}>
				<Icon icon="play-fill" />
			</button>
		{/if}
		{#if isFiltering || deck?.playlist_tracks_filtered}
			<button onclick={clearFilters} {@attach tooltip({content: m.queue_clear_filters()})}>
				<Icon icon="close" />
			</button>
		{/if}
		{#if !appState.embed_mode && trackIds.length > 0 && (deck?.is_playing ? trackIds.length > 1 : true)}
			<button
				onclick={handleClearQueue}
				{@attach tooltip({content: m.common_clear()})}
				title={m.common_clear()}
			>
				<Icon icon="delete" />
			</button>
		{/if}
	</div>

	{#if selectedTags.length > 0}
		<FilterChips tags={selectedTags} onRemoveTag={toggleTag} />
	{/if}

	<main class="scroll">
		{#if filteredQueueTracks.length > 0}
			<Tracklist
				bind:this={tracklist}
				tracks={filteredQueueTracks}
				{deckId}
				virtual={true}
				{selectedTrackId}
				{canEditTrack}
				onSelectTrack={(trackId) => (selectedTrackId = trackId)}
				onTagClick={toggleTag}
				{selectedTags}
			/>
		{:else if queueTracks.length === 0}
			<div class="empty-state">
				<p><small>{m.queue_no_tracks()}</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>{m.queue_empty()}</p>
				{#if searchQuery}
					<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	.queue-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		width: 100%;
		border-top: 1px solid var(--color-interface-border);
	}

	main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		background: transparent;
	}

	/* Same fix as player.svelte/deck-compact-bar.svelte: TrackCard's .active
	   is transparent by default (correct on a normal page), but this panel
	   sits on the deck's --floating-bg, not the app's plain background. */
	main :global(article.active) {
		background: var(--color-interface);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;

		p {
			margin: 0;
		}

		small {
			color: var(--gray-9);
		}
	}

	.search-container {
		display: flex;
		flex-wrap: wrap;
		padding: 0.5rem;
		border-bottom: 1px solid var(--color-interface-border);
		align-items: center;
		gap: var(--space-1);
	}

	.search-container :global(.search-input) {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.search-container :global(.search-input input[type='search']) {
		width: 100%;
	}

	:global(.queue-panel > .filter-chips) {
		padding: 0 0.5rem 0.5rem;
		border-bottom: 1px solid var(--color-interface-border);
	}

	main :global(.index) {
		display: none;
	}

	/* Keep text columns aligned when some queue items have no artwork */
	main :global(.card:not(:has(.artwork)))::before {
		content: '';
		flex: 0 0 var(--track-artwork-size);
		align-self: center;
	}

	/* Hide above if user has hidden artwork */
	main :global(.hide-artwork .card:not(:has(.artwork)))::before {
		content: none;
	}
</style>
