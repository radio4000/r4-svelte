<script>
	import {fuzzySearch, extractMentions} from '$lib/utils'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {clearQueue, clearAllQueue} from '$lib/api'
	import SearchInput from './search-input.svelte'
	import FilterChips from './filter-chips.svelte'
	import Icon from './icon.svelte'
	import Tracklist from './tracklist.svelte'
	import {tick, untrack} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId: number, scrollToActive?: (() => void) | undefined}} */
	// Write-only bindable: the parent calls it, so the destructure itself is never read here.
	let {deckId, scrollToActive = $bindable()} = $props()

	let deck = $derived(appState.decks[deckId])

	// The filter lives on the deck: it survives closing the panel and decides what plays.
	/** @type {NonNullable<import('$lib/types').Deck['queue_filter']>} */
	const noFilter = {search: '', tags: [], mention: ''}
	let filter = $derived(deck?.queue_filter ?? noFilter)
	let isFiltering = $derived(Boolean(deck?.queue_filter))

	/** @param {Partial<typeof noFilter>} patch */
	function setFilter(patch) {
		if (!deck) return
		const next = {...filter, ...patch}
		deck.queue_filter = next.search || next.tags.length || next.mention ? next : undefined
		if (!deck.queue_filter) deck.playlist_tracks_filtered = undefined
	}

	function clearFilters() {
		setFilter(noFilter)
	}

	/** @param {string} tag */
	function toggleTag(tag) {
		setFilter({
			tags: filter.tags.includes(tag) ? filter.tags.filter((t) => t !== tag) : [...filter.tags, tag]
		})
	}

	/** @param {string} slug bare, lowercase, like ?mention= on /tracks */
	function toggleMention(slug) {
		setFilter({mention: filter.mention === slug ? '' : slug})
	}
	let selectedTrackId = $state(/** @type {string | null} */ (null))
	/** @type {any} */
	let tracklist = $state()

	async function doScrollToActive() {
		if (!deck?.playlist_track) return

		// If the active track is filtered out, clear the filters so it appears
		if (isFiltering && !filteredQueueTracks.some((t) => t.id === deck?.playlist_track)) {
			clearFilters()
			await tick()
		}

		const idx = filteredQueueTracks.findIndex((t) => t.id === deck?.playlist_track)
		if (idx >= 0) tracklist?.scrollToItem(idx)
	}

	$effect(() => {
		scrollToActive = doScrollToActive
	})

	// The full queue, not getActiveQueue(), which this filter already narrows.
	let trackIds = $derived(
		(deck?.shuffle ? deck.playlist_tracks_shuffled : deck?.playlist_tracks) ?? []
	)

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

	let filteredQueueTracks = $derived(
		isFiltering
			? fuzzySearch(filter.search, queueTracks, ['title', 'tags', 'description']).filter(
					(t) =>
						filter.tags.every((tag) => t.tags?.includes(tag)) &&
						(!filter.mention || extractMentions(t.description ?? '').includes(`@${filter.mention}`))
				)
			: queueTracks
	)

	// What the list shows is what plays: next/prev stay within the matches.
	// No matches leaves playback alone rather than stopping after this track.
	$effect(() => {
		if (!deck?.queue_filter) return
		const ids = filteredQueueTracks.length ? filteredQueueTracks.map((t) => t.id) : undefined
		const prev = untrack(() => deck.playlist_tracks_filtered)
		if (prev === ids || (prev?.length === ids?.length && ids?.every((id, i) => id === prev?.[i])))
			return
		deck.playlist_tracks_filtered = ids
	})

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
			bind:value={() => filter.search, (search) => setFilter({search})}
			placeholder={`${filteredQueueTracks.length}/${queueTracks.length}`}
			debounce={150}
		/>
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

	{#if filter.tags.length || filter.mention}
		<FilterChips
			tags={filter.tags}
			mention={filter.mention}
			onRemoveTag={toggleTag}
			onClearMention={() => setFilter({mention: ''})}
		/>
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
				onMentionClick={toggleMention}
				selectedTags={filter.tags}
			/>
		{:else if queueTracks.length === 0}
			<div class="empty-state">
				<p><small>{m.queue_no_tracks()}</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>{m.queue_empty()}</p>
				{#if filter.search}
					<p><small>{m.search_no_results()} "{filter.search}"</small></p>
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

	.queue-panel > :global(.filter-chips) {
		align-items: center;
		padding: var(--space-1) 0.5rem;
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
