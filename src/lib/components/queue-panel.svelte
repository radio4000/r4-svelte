<script>
	import fuzzysort from 'fuzzysort'
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {getTracksCollection, playHistoryCollection} from '$lib/collections'
	import {relativeTime} from '$lib/dates'
	import Modal from './modal.svelte'
	import SearchInput from './search-input.svelte'
	import TrackCard from './track-card.svelte'
	import Tracklist from './tracklist.svelte'

	const appState = $derived(useAppState().data)

	let view = $state('queue') // 'queue' or 'history'
	let showClearHistoryModal = $state(false)
	let searchQuery = $state('')

	/** @type {string[]} */
	let trackIds = $derived(appState?.playlist_tracks || [])

	let filteredPlayHistory = $derived(
		searchQuery
			? fuzzysort
					.go(searchQuery, playHistory, {
						keys: ['title', 'tags', 'channel_name'],
						threshold: -10000
					})
					.map((result) => result.obj)
			: playHistory
	)

	let tracksCollection = getTracksCollection()

	// Get all tracks from collection, filter in derived
	let allTracks = $derived(tracksCollection.toArray)

	// Maintain queue order (trackIds order, not query result order)
	let queueTracks = $derived.by(() => {
		if (!trackIds.length || !allTracks.length) return []
		const trackMap = new Map(allTracks.map((track) => [track.id, track]))
		return trackIds.map((id) => trackMap.get(id)).filter(Boolean)
	})

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

	// Get play history from collection directly
	let allPlayHistory = $derived(playHistoryCollection.toArray)

	// Client-side join: merge history entries with track data
	/** @type {(import('$lib/types').Track & import('$lib/types').PlayHistory)[]} */
	let playHistory = $derived.by(() => {
		if (!allPlayHistory?.length) return []

		const tracks = allTracks
		const trackMap = new Map(tracks.map((t) => [t.id, t]))

		return allPlayHistory
			.map((entry) => {
				const track = trackMap.get(entry.track_id)
				return track ? {...track, ...entry} : null
			})
			.filter(Boolean)
			.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
	})

	function clearQueue() {
		appStateCollection.update(1, (draft) => {
			draft.playlist_tracks = []
			draft.playlist_track = undefined
		})
	}

	function clearHistory() {
		// Delete all play history entries
		for (const entry of playHistoryCollection.toArray) {
			playHistoryCollection.delete(entry.id)
		}
		showClearHistoryModal = false
	}
</script>

<aside>
	<header>
		<menu>
			<button onclick={() => (view = 'queue')} class:active={view === 'queue'}>Queue ({queueTracks.length})</button>
			<button onclick={() => (view = 'history')} class:active={view === 'history'}
				>History ({playHistory.length})</button
			>
		</menu>
	</header>

	<div class="search-container">
		<SearchInput bind:value={searchQuery} placeholder="Search {view}..." />
		{#if view === 'queue' && trackIds.length > 0}
			<button onclick={clearQueue} {@attach tooltip({content: 'Clear queued tracks'})}>Clear</button>
		{:else if view === 'history' && playHistory.length > 0}
			<button onclick={() => (showClearHistoryModal = true)} {@attach tooltip({content: 'Clear playlist history'})}
				>Clear</button
			>
		{/if}
	</div>

	<main class="scroll">
		{#if view === 'queue'}
			{#if filteredQueueTracks.length > 0}
				<Tracklist tracks={filteredQueueTracks} />
			{:else if trackIds.length > 0 && searchQuery}
				<div class="empty-state">
					<p>No tracks found</p>
					<p><small>Try a different search term</small></p>
				</div>
			{:else if trackIds.length === 0}
				<div class="empty-state">
					<p>No tracks in queue</p>
					<p><small>Select a channel to start playing</small></p>
				</div>
			{:else}
				<div class="empty-state">
					<p>No tracks found</p>
					<p><small>Try a different search term</small></p>
				</div>
			{/if}
		{:else if filteredPlayHistory.length > 0}
			<ul class="list tracks">
				{#each filteredPlayHistory as entry, index (index)}
					<li>
						<TrackCard track={entry} {index}>
							<p class="history">
								<small>
									{relativeTime(entry.started_at)}
									{#if entry.reason_start}• {entry.reason_start}{/if}
									{#if entry.reason_end}→ {entry.reason_end}{/if}
									{#if entry.ms_played}• {Math.round(entry.ms_played / 1000)}s{/if}
								</small>
							</p>
						</TrackCard>
					</li>
				{/each}
			</ul>
		{:else if playHistory.length > 0 && searchQuery}
			<div class="empty-state">
				<p>No history found</p>
				<p><small>Try a different search term</small></p>
			</div>
		{:else}
			<div class="empty-state">
				<p>No play history</p>
				<p><small>Start playing tracks to see history</small></p>
			</div>
		{/if}
	</main>
</aside>

<Modal bind:showModal={showClearHistoryModal}>
	{#snippet header()}
		<h2>Clear listening history</h2>
	{/snippet}
	<p>Are you sure you want to clear your listening history? This cannot be undone.</p>
	<menu>
		<button type="button" onclick={() => (showClearHistoryModal = false)}>Cancel</button>
		<button type="button" onclick={clearHistory} class="danger">Clear history</button>
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
