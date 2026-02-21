<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {inArray} from '@tanstack/db'
	import {fuzzySearch} from '$lib/search'
	import {appState} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {relativeTime} from '$lib/dates'
	import {playHistoryCollection, clearPlayHistory, tracksCollection} from '$lib/tanstack/collections'
	import {shuffleRemaining} from '$lib/api'
	import Dialog from './dialog.svelte'
	import SearchInput from './search-input.svelte'
	import Icon from './icon.svelte'
	import TrackCard from './track-card.svelte'
	import Tracklist from './tracklist.svelte'
	import {tick} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId: number, scrollToActive?: (() => void) | undefined}} */
	let {deckId, scrollToActive = $bindable(undefined)} = $props()

	let deck = $derived(appState.decks[deckId])

	let view = $state('queue') // 'queue' or 'history'
	let showClearHistoryModal = $state(false)
	let searchQuery = $state('')
	let selectedTrackId = $state(/** @type {string | null} */ (null))
	/** @type {any} */
	let tracklist = $state()

	async function doScrollToActive() {
		if (!deck?.playlist_track) return

		// Switch to queue view if needed — virtual list won't be mounted otherwise
		if (view !== 'queue') {
			view = 'queue'
			await tick()
		}

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

	let trackIds = $derived(deck?.playlist_tracks ?? [])

	// Resolve tracks by playlist IDs (works for cross-channel queues like search results)
	const tracksQuery = useLiveQuery((q) =>
		q.from({t: tracksCollection}).where(({t}) => inArray(t.id, trackIds.length ? trackIds : ['']))
	)

	// Order by playlist_tracks position
	let queueTracks = $derived.by(() => {
		const byId = new Map((tracksQuery.data ?? []).map((t) => [t.id, t]))
		return trackIds.map((id) => byId.get(id)).filter((t) => !!t)
	})

	const historyQuery = useLiveQuery((q) =>
		q.from({history: playHistoryCollection}).orderBy(({history}) => history.started_at, 'desc')
	)
	let playHistory = $derived(historyQuery.data || [])

	let filteredQueueTracks = $derived(fuzzySearch(searchQuery, queueTracks, ['title', 'tags', 'description']))

	let filteredPlayHistory = $derived(fuzzySearch(searchQuery, playHistory, ['title', 'slug']))

	function clearQueue() {
		if (!deck) return
		deck.playlist_tracks = []
		deck.playlist_track = undefined
	}

	function clearHistory() {
		clearPlayHistory()
		showClearHistoryModal = false
	}

	/** Adapt play history entry to Track structure for TrackCard
	 * @param {import('$lib/types').PlayHistory} entry
	 * @returns {import('$lib/types').Track}
	 */
	function playHistoryToTrack(entry) {
		return {
			id: entry.track_id,
			slug: entry.slug,
			title: entry.title,
			url: entry.url,
			created_at: entry.started_at,
			updated_at: entry.started_at,
			channel_id: undefined,
			description: null,
			discogs_url: null,
			duration: null,
			fts: null,
			mentions: null,
			playback_error: null,
			tags: null
		}
	}
</script>

<div class="queue-panel">
	<header>
		<menu class="tabs">
			<button onclick={() => (view = 'queue')} class:active={view === 'queue'}>
				<Icon icon="unordered-list" size={16} />
				{m.button_queue()} ({queueTracks.length})
			</button>
			<button onclick={() => (view = 'history')} class:active={view === 'history'}>
				<Icon icon="history" size={16} />
				{m.nav_history()} ({playHistory.length})
			</button>
		</menu>
	</header>

	<div class="search-container">
		<SearchInput bind:value={searchQuery} placeholder={m.search_placeholder()} debounce={150} />
		{#if searchQuery !== ''}
			<button onclick={() => (searchQuery = '')} {@attach tooltip({content: 'Clear search'})}>
				<Icon icon="close" size={16} />
			</button>
		{/if}
		{#if view === 'queue' && trackIds.length > 1}
			<button
				onclick={() => shuffleRemaining(deckId)}
				{@attach tooltip({content: m.queue_shuffle_remaining()})}
				title={m.queue_shuffle_remaining()}
			>
				<Icon icon="shuffle" size={16} />
			</button>
			<button onclick={clearQueue} {@attach tooltip({content: m.common_clear()})} title={m.common_clear()}>
				<Icon icon="delete" size={16} />
			</button>
		{:else if view === 'history' && playHistory.length > 0}
			<button onclick={() => (showClearHistoryModal = true)} {@attach tooltip({content: m.common_clear()})}>
				<Icon icon="delete" size={16} />
			</button>
		{/if}
	</div>

	<main class="scroll">
		{#if view === 'queue'}
			{#if filteredQueueTracks.length > 0}
				<Tracklist
					bind:this={tracklist}
					tracks={filteredQueueTracks}
					{deckId}
					virtual={true}
					{selectedTrackId}
					onSelectTrack={(trackId) => (selectedTrackId = trackId)}
				/>
			{:else if queueTracks.length === 0}
				<div class="empty-state">
					<p>{m.queue_no_tracks()}</p>
					<p><small>{m.queue_select_channel()}</small></p>
				</div>
			{:else}
				<div class="empty-state">
					<p>{m.queue_empty()}</p>
					<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
				</div>
			{/if}
		{:else if filteredPlayHistory.length > 0}
			<ul class="list tracks">
				{#each filteredPlayHistory as entry, index (entry.id)}
					<li
						data-skipped={(entry.ms_played != null && entry.ms_played < 3000) || null}
						data-start-reason={entry.reason_start || null}
						data-end-reason={entry.reason_end || null}
					>
						<TrackCard track={playHistoryToTrack(entry)} {index}>
							{#snippet description()}
								{relativeTime(entry.started_at)}
								{#if entry.reason_start}• {entry.reason_start}{/if}
								{#if entry.reason_end}→ {entry.reason_end}{/if}
								{#if entry.ms_played}
									• {m.queue_seconds_suffix({seconds: Math.round(entry.ms_played / 1000)})}
								{/if}
							{/snippet}
						</TrackCard>
					</li>
				{/each}
			</ul>
		{:else if playHistory.length === 0}
			<div class="empty-state">
				<p>{m.queue_no_play_history()}</p>
				<p><small>{m.queue_history_hint()}</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>{m.queue_no_history()}</p>
				<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
			</div>
		{/if}
	</main>
</div>

<Dialog bind:showModal={showClearHistoryModal}>
	{#snippet header()}
		<h2>{m.queue_clear_history_title()}</h2>
	{/snippet}
	<p>{m.queue_clear_history_confirm()}</p>
	<menu>
		<button type="button" onclick={() => (showClearHistoryModal = false)}>{m.common_cancel()}</button>
		<button type="button" onclick={clearHistory} class="danger">{m.queue_clear_history_button()}</button>
	</menu>
</Dialog>

<style>
	.queue-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		width: 100%;
		border-top: 1px solid var(--gray-6);
	}

	header {
		display: flex;
		justify-content: space-between;
		background: var(--aside-bg);
		border-bottom: 1px solid var(--gray-5);
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

	.tracks :global(.slug),
	main :global(.index) {
		display: none;
	}

	li[data-skipped] {
		opacity: 0.6;
		:global(a) {
			padding-top: 0.2rem;
			padding-bottom: 0.2rem;
		}
		:global(.artwork) {
			display: none;
		}
	}

	/* Keep text columns aligned when some queue items have no artwork */
	main :global(.card:not(:has(.artwork)))::before {
		content: '';
		flex: 0 0 var(--track-artwork-size);
		align-self: center;
	}
</style>
