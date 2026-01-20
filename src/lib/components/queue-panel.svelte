<script>
	import fuzzysort from 'fuzzysort'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'
	import {inArray} from '@tanstack/db'
	import {appState} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {relativeTime} from '$lib/dates'
	import {playHistoryCollection, clearPlayHistory, tracksCollection} from '$lib/tanstack/collections'
	import {shuffleRemaining} from '$lib/api'
	import Modal from './modal.svelte'
	import SearchInput from './search-input.svelte'
	import TrackCard from './track-card.svelte'
	import Tracklist from './tracklist.svelte'
	import * as m from '$lib/paraglide/messages'

	let view = $state('queue') // 'queue' or 'history'
	let showClearHistoryModal = $state(false)
	let searchQuery = $state('')

	// Resize handle state
	const MIN_WIDTH = 200
	const MAX_WIDTH = 800
	let isDragging = $state(false)

	/** @param {PointerEvent} e */
	function startDrag(e) {
		if (window.matchMedia('(max-width: 768px)').matches) return
		isDragging = true
		document.body.style.cursor = 'ew-resize'
		document.body.style.userSelect = 'none'
		window.addEventListener('pointermove', onDrag)
		window.addEventListener('pointerup', stopDrag)
		e.preventDefault()
	}

	/** @param {PointerEvent} e */
	function onDrag(e) {
		if (!isDragging) return
		const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX))
		appState.queue_panel_width = newWidth
	}

	function stopDrag() {
		isDragging = false
		document.body.style.cursor = ''
		document.body.style.userSelect = ''
		window.removeEventListener('pointermove', onDrag)
		window.removeEventListener('pointerup', stopDrag)
	}

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
						threshold: 0.5
					})
					.map((result) => result.obj)
			: queueTracks
	)

	let filteredPlayHistory = $derived(
		searchQuery
			? fuzzysort
					.go(searchQuery, playHistory, {
						keys: ['title', 'slug'],
						threshold: 0.5
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

<aside class:dragging={isDragging}>
	<div class="resize-handle" onpointerdown={startDrag} role="separator" aria-orientation="vertical"></div>
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
		{#if view === 'queue' && trackIds.length > 1}
			<menu class="queue-actions">
				<button
					onclick={shuffleRemaining}
					{@attach tooltip({content: m.queue_shuffle_remaining()})}
					title={m.queue_shuffle_remaining()}>⤮</button
				>
				<button onclick={clearQueue} {@attach tooltip({content: m.common_clear()})} title={m.common_clear()}>✕</button>
			</menu>
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
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--aside-bg);
		border-left: 1px solid var(--gray-6);

		/* perf trick! */
		contain: layout size;
	}

	aside.dragging {
		user-select: none;
	}

	.resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		background: transparent;
		z-index: 10;
		touch-action: none;
	}

	.resize-handle:hover,
	aside.dragging .resize-handle {
		background: var(--accent-7);
	}

	@media (max-width: 768px) {
		.resize-handle {
			display: none;
		}
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
		flex: 1;
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
		gap: 0.25rem;
	}

	.queue-actions {
		display: flex;
		gap: var(--space-1);
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
