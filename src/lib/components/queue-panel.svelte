<script>
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {inArray} from '@tanstack/db'
	import {fuzzySearch} from '$lib/search'
	import {appState} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {tracksCollection} from '$lib/collections/tracks'
	import {toggleShuffle} from '$lib/api'
	import {getActiveQueue} from '$lib/player/queue'
	import SearchInput from './search-input.svelte'
	import Icon from './icon.svelte'
	import Tracklist from './tracklist.svelte'
	import {tick} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId: number, scrollToActive?: (() => void) | undefined, embedLocked?: boolean}} */
	let {deckId, scrollToActive = $bindable(undefined), embedLocked = false} = $props()

	let deck = $derived(appState.decks[deckId])

	let searchQuery = $state('')
	let selectedTrackId = $state(/** @type {string | null} */ (null))
	/** @type {any} */
	let tracklist = $state()

	async function doScrollToActive() {
		if (!deck?.playlist_track) return

		// If the active track is filtered out, clear the search so it appears
		if (searchQuery && !filteredQueueTracks.some((t) => t.id === deck?.playlist_track)) {
			searchQuery = ''
			await tick()
		}

		const idx = filteredQueueTracks.findIndex((t) => t.id === deck?.playlist_track)
		if (idx >= 0) tracklist?.scrollToItem(idx)
	}

	$effect(() => {
		scrollToActive = doScrollToActive
	})

	let trackIds = $derived(getActiveQueue(deck))

	// Resolve tracks by playlist IDs (works for cross-channel queues like search results)
	const tracksQuery = useLiveQuery((q) =>
		q.from({t: tracksCollection}).where(({t}) => inArray(t.id, trackIds.length ? trackIds : ['']))
	)

	// Order by playlist_tracks position
	let queueTracks = $derived.by(() => {
		const byId = new Map((tracksQuery.data ?? []).map((t) => [t.id, t]))
		return trackIds.map((id) => byId.get(id)).filter((t) => !!t)
	})

	let filteredQueueTracks = $derived(fuzzySearch(searchQuery, queueTracks, ['title', 'tags', 'description']))

	/** @param {string} tag */
	function toggleTag(tag) {
		const query = '#' + tag
		searchQuery = searchQuery === query ? '' : query
	}

	function clearQueue() {
		if (!deck) return
		deck.playlist_tracks = []
		deck.playlist_tracks_shuffled = []
		deck.playlist_track = undefined
	}
</script>

<div class="queue-panel">
	<div class="search-container">
		<SearchInput
			bind:value={searchQuery}
			placeholder={`${m.search_placeholder()} (${queueTracks.length})`}
			debounce={150}
		/>
		{#if searchQuery !== ''}
			<button onclick={() => (searchQuery = '')} {@attach tooltip({content: m.queue_clear_search()})}>
				<Icon icon="close" size={16} />
			</button>
		{/if}
		{#if trackIds.length > 1}
			<button
				onclick={() => toggleShuffle(deckId)}
				class:active={deck?.shuffle}
				{@attach tooltip({content: m.player_tooltip_shuffle()})}
				title={m.player_tooltip_shuffle()}
			>
				<Icon icon="shuffle" size={16} />
			</button>
			{#if !embedLocked}
				<button onclick={clearQueue} {@attach tooltip({content: m.common_clear()})} title={m.common_clear()}>
					<Icon icon="delete" size={16} />
				</button>
			{/if}
		{/if}
	</div>

	<main class="scroll">
		{#if filteredQueueTracks.length > 0}
			<Tracklist
				bind:this={tracklist}
				tracks={filteredQueueTracks}
				{deckId}
				virtual={true}
				{selectedTrackId}
				onSelectTrack={(trackId) => (selectedTrackId = trackId)}
				onTagClick={toggleTag}
				{embedLocked}
			/>
		{:else if queueTracks.length === 0}
			<div class="empty-state">
				<p><small>{m.queue_no_tracks()}</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>{m.queue_empty()}</p>
				<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
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
		border-top: 1px solid var(--gray-6);
	}

	main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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
		border-bottom: 1px solid var(--gray-5);
		align-items: center;
		gap: 0.25rem;
	}

	.search-container :global(.search-input) {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.search-container :global(.search-input input[type='search']) {
		width: 100%;
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
