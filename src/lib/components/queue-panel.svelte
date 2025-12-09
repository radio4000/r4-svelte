<script>
	import fuzzysort from 'fuzzysort'
	import {useLiveQuery, inArray} from '@tanstack/svelte-db'
	import {appState} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {relativeTime} from '$lib/dates'
	import {playHistoryCollection, clearPlayHistory, tracksCollection} from '../../routes/tanstack/collections'
	import Modal from './modal.svelte'
	import SearchInput from './search-input.svelte'
	import TrackCard from './track-card.svelte'
	import Tracklist from './tracklist.svelte'
	import * as m from '$lib/paraglide/messages'

	let view = $state('queue') // 'queue' or 'history'
	let showClearHistoryModal = $state(false)
	let searchQuery = $state('')

	/** @type {string[]} */
	let trackIds = $derived(appState.playlist_tracks || [])

	// Query tracks from collection, preserving playlist order
	const tracksQuery = useLiveQuery((q) =>
		q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, trackIds))
	)
	/** @type {import('$lib/types').Track[]} */
	let queueTracks = $derived.by(() => {
		const trackMap = new Map((tracksQuery.data || []).map((t) => [t.id, t]))
		return trackIds.map((id) => trackMap.get(id)).filter((t) => t !== undefined)
	})

	const historyQuery = useLiveQuery((q) =>
		q.from({history: playHistoryCollection}).orderBy(({history}) => history.started_at, 'desc')
	)
	let playHistory = $derived(historyQuery.data || [])

	let filteredQueueTracks = $derived(
		searchQuery
			? fuzzysort
					.go(searchQuery, queueTracks, {
						keys: ['title', 'tags', 'channel_name'],
						threshold: -10000
					})
					.map((result) => result.obj)
			: queueTracks
	)

	let filteredPlayHistory = $derived(
		searchQuery
			? fuzzysort
					.go(searchQuery, playHistory, {
						keys: ['title', 'slug'],
						threshold: -10000
					})
					.map((result) => result.obj)
			: playHistory
	)

	function clearQueue() {
		appState.playlist_tracks = []
		appState.playlist_track = undefined
	}

	function clearHistory() {
		clearPlayHistory()
		showClearHistoryModal = false
	}

	/** Transform history entry to track-like shape for TrackCard
	 * @param {import('$lib/types').PlayHistory & {title?: string, url?: string, slug?: string}} entry
	 * @returns {import('$lib/types').Track}
	 */
	function historyToTrack(entry) {
		return {
			id: entry.track_id,
			slug: entry.slug ?? null,
			title: entry.title || '',
			url: entry.url || '',
			created_at: entry.started_at,
			updated_at: entry.started_at,
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

<aside>
	<header>
		<menu>
			<button onclick={() => (view = 'queue')} class:active={view === 'queue'}
				>{m.button_queue()} ({queueTracks.length})</button
			>
			<button onclick={() => (view = 'history')} class:active={view === 'history'}
				>{m.nav_history()} ({playHistory.length})</button
			>
		</menu>
	</header>

	<div class="search-container">
		<SearchInput bind:value={searchQuery} placeholder={m.search_placeholder()} />
		{#if view === 'queue' && trackIds.length > 0}
			<button onclick={clearQueue} {@attach tooltip({content: m.queue_no_tracks()})}>{m.common_clear()}</button>
		{:else if view === 'history' && playHistory.length > 0}
			<button onclick={() => (showClearHistoryModal = true)} {@attach tooltip({content: m.queue_no_history()})}
				>{m.common_clear()}</button
			>
		{/if}
	</div>

	<main class="scroll">
		{#if view === 'queue'}
			{#if filteredQueueTracks.length > 0}
				<Tracklist tracks={filteredQueueTracks} />
			{:else if trackIds.length > 0 && searchQuery}
				<div class="empty-state">
					<p>{m.queue_empty()}</p>
					<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
				</div>
			{:else if trackIds.length === 0}
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
					<li>
						<TrackCard track={historyToTrack(entry)} {index}>
							<p class="history">
								<small>
									{relativeTime(entry.started_at)}
									{#if entry.reason_start}• {entry.reason_start}{/if}
									{#if entry.reason_end}→ {entry.reason_end}{/if}
									{#if entry.ms_played}
										• {m.queue_seconds_suffix({seconds: Math.round(entry.ms_played / 1000)})}
									{/if}
								</small>
							</p>
						</TrackCard>
					</li>
				{/each}
			</ul>
		{:else if playHistory.length > 0 && searchQuery}
			<div class="empty-state">
				<p>{m.queue_no_history()}</p>
				<p><small>{m.search_no_results()} "{searchQuery}"</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>{m.queue_no_play_history()}</p>
				<p><small>{m.queue_history_hint()}</small></p>
			</div>
		{/if}
	</main>
</aside>

<Modal bind:showModal={showClearHistoryModal}>
	{#snippet header()}
		<h2>{m.queue_clear_history_title()}</h2>
	{/snippet}
	<p>{m.queue_clear_history_confirm()}</p>
	<menu>
		<button type="button" onclick={() => (showClearHistoryModal = false)}>{m.common_cancel()}</button>
		<button type="button" onclick={clearHistory} class="danger">{m.queue_clear_history_button()}</button>
	</menu>
</Modal>

<style>
	aside {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--aside-bg);
		border-left: 1px solid var(--gray-6);

		/* perf trick! */
		contain: layout size;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
		background: var(--aside-bg);
		border-bottom: 1px solid var(--gray-5);
	}

	p.history {
		margin: 0 0 0 0.5rem;
	}

	main {
		flex: 1;
		padding-bottom: var(--player-compact-size);
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
		padding: 0.5rem;
		border-bottom: 1px solid var(--gray-5);
		justify-content: space-between;
	}

	.tracks :global(.slug) {
		display: none;
	}
</style>
