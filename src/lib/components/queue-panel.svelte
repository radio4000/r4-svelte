<script>
	import {untrack} from 'svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
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
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])

	let view = $state('queue') // 'queue' or 'history'
	let showClearHistoryModal = $state(false)
	let searchQuery = $state('')
	let selectedTrackId = $state(/** @type {string | null} */ (null))

	/** @type {string[]} */
	let trackIds = $derived(deck?.playlist_tracks || [])

	// Read tracks directly from collection state, preserving playlist order
	/** @type {import('$lib/types').Track[]} */
	let queueTracks = $derived.by(() => {
		const ids = trackIds
		if (!ids.length) return []
		return untrack(() => ids.map((id) => tracksCollection.state.get(id)).filter((t) => t != null))
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
		<menu class="tab-nav">
			<button onclick={() => (view = 'queue')} class:active={view === 'queue'}>
				<Icon icon="unordered-list" size={16} />
				{m.button_queue()} ({queueTracks.length})
			</button>
			<button onclick={() => (view = 'history')} class:active={view === 'history'}>
				<Icon icon="history" size={16} />
				{m.nav_history()} ({playHistory.length})
			</button>
		</menu>
		{#if view === 'queue' && trackIds.length > 1}
			<menu class="queue-actions">
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
			</menu>
		{:else if view === 'history' && playHistory.length > 0}
			<menu class="queue-actions">
				<button onclick={() => (showClearHistoryModal = true)} {@attach tooltip({content: m.common_clear()})}>
					<Icon icon="delete" size={16} />
				</button>
			</menu>
		{/if}
	</header>

	<div class="search-container">
		<SearchInput bind:value={searchQuery} placeholder={m.search_placeholder()} debounce={150} />
	</div>

	<main class="scroll">
		{#if view === 'queue'}
			{#if filteredQueueTracks.length > 0}
				<Tracklist
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
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
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

	.tab-nav {
		display: flex;
	}

	.tab-nav button {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		white-space: nowrap;
		padding: 0.5rem 0.5rem 0.45rem;
		background: none;
		border: none;
		border-radius: 0;
	}

	.tab-nav button:hover {
		background: var(--gray-3);
		text-decoration: underline;
		text-decoration-thickness: 0.1px;
		text-decoration-color: var(--gray-10);
		text-underline-offset: max(0.1em, 2px);
	}

	.tab-nav button:focus-visible {
		outline: 2px solid var(--accent-9);
		outline-offset: -2px;
	}

	.tab-nav button.active {
		box-shadow: inset 0 -2px 0 var(--accent-9);
	}

	.search-container :global(.search-input) {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.search-container :global(.search-input input[type='search']) {
		width: 100%;
	}

	.queue-actions {
		display: flex;
		gap: var(--space-1);
		flex: 0 0 auto;
		margin-left: auto;
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
</style>
