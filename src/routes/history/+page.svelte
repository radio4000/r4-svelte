<script lang="ts">
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {playHistoryCollection, clearPlayHistory} from '$lib/collections/play-history'
	import {tracksCollection} from '$lib/collections/tracks'
	import {playTrack, setPlaylist, addToPlaylist, playNext} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import {getLocale} from '$lib/paraglide/runtime'
	import {dayLabel, formatDurationCompact} from '$lib/dates.js'
	import TrackCard from '$lib/components/track-card.svelte'
	import DateTime from '$lib/components/date-time.svelte'
	import Icon from '$lib/components/icon.svelte'
	import type {Track, PlayStartReason} from '$lib/types'
	import {parseUrl} from 'media-now'
	import {SvelteSet} from 'svelte/reactivity'

	const historyQuery = useLiveQuery((q) =>
		q.from({history: playHistoryCollection}).orderBy(({history}) => history.started_at, 'desc')
	)

	let history = $derived(historyQuery.data || [])

	// Group entries by calendar day (key = toDateString() which is locale-neutral and day-accurate)
	let days = $derived.by(() => {
		const result: {key: string; plays: typeof history}[] = []
		for (const play of history) {
			const key = new Date(play.started_at).toDateString()
			if (result.length === 0 || result.at(-1)!.key !== key) {
				result.push({key, plays: []})
			}
			result.at(-1)!.plays.push(play)
		}
		return result
	})

	function toTrack(play: (typeof history)[number]): Track {
		const parsed = play.url ? parseUrl(play.url) : null
		return {
			id: play.track_id,
			title: play.title,
			url: play.url,
			slug: play.slug,
			provider: parsed?.provider ?? null,
			media_id: parsed?.id ?? null,
			description: null,
			created_at: play.started_at,
			updated_at: play.started_at,
			discogs_url: null,
			duration: null,
			fts: null,
			mentions: null,
			playback_error: null,
			tags: null
		} as unknown as Track
	}

	function upsertHistoryTracks() {
		if (!tracksCollection.isReady()) tracksCollection.startSyncImmediate()
		const seen = new SvelteSet<string>()
		tracksCollection.utils.writeBatch(() => {
			for (const p of history) {
				if (!tracksCollection.get(p.track_id) && !seen.has(p.track_id)) {
					seen.add(p.track_id)
					tracksCollection.utils.writeUpsert(toTrack(p))
				}
			}
		})
	}

	async function playHistoryTrack(play: (typeof history)[number]) {
		upsertHistoryTracks()
		const uniqueIds = [...new Set(history.map((p) => p.track_id))]
		// playTrack auto-creates a deck if none exists; await so deck is guaranteed before setPlaylist
		await playTrack(appState.active_deck_id, play.track_id, null, 'user_click_track')
		setPlaylist(appState.active_deck_id, uniqueIds)
	}

	async function playHistory() {
		if (!history.length) return
		upsertHistoryTracks()
		const uniqueIds = [...new Set(history.map((p) => p.track_id))]
		await playTrack(appState.active_deck_id, uniqueIds[0], null, 'user_click_track')
		setPlaylist(appState.active_deck_id, uniqueIds)
	}

	async function queueHistoryTrack(play: (typeof history)[number]) {
		// No active deck — fall back to play so the track actually starts
		if (!appState.decks[appState.active_deck_id]) {
			await playHistoryTrack(play)
			return
		}
		if (!tracksCollection.get(play.track_id)) {
			if (!tracksCollection.isReady()) tracksCollection.startSyncImmediate()
			tracksCollection.utils.writeBatch(() => tracksCollection.utils.writeUpsert(toTrack(play)))
		}
		playNext(appState.active_deck_id, play.track_id)
	}

	async function queueHistory() {
		if (!history.length) return
		// No active deck — fall back to play
		if (!appState.decks[appState.active_deck_id]) {
			await playHistory()
			return
		}
		upsertHistoryTracks()
		const uniqueIds = [...new Set(history.map((p) => p.track_id))]
		addToPlaylist(appState.active_deck_id, uniqueIds)
	}

	const startReasons: Partial<Record<PlayStartReason, {icon: string; label: () => string}>> = {
		play_channel: {icon: 'radio', label: m.history_reason_play_channel},
		play_search: {icon: 'search', label: m.history_reason_play_search},
		user_click_track: {icon: 'hand-pointer', label: m.history_reason_user_click},
		user_next: {icon: 'next-fill', label: m.history_reason_user_next},
		user_prev: {icon: 'previous-fill', label: m.history_reason_user_prev},
		auto_next: {icon: 'next-fill', label: m.history_reason_auto_next},
		broadcast_sync: {icon: 'signal', label: m.history_reason_broadcast}
	}

	let selectedId = $state<string | null>(null)
	let confirmClear = $state(false)

	const locale = $derived(appState.language || getLocale())
</script>

<svelte:head>
	<title>{m.page_title_history()}</title>
</svelte:head>

<article>
	<header class="constrained">
		<h1>{m.history_title()}</h1>
		<p>{m.history_local_note()}</p>
	</header>
	{#if history.length > 0}
		<div class="header-actions">
			<div class="clear-actions">
				{#if confirmClear}
					<button
						class="danger"
						onclick={() => {
							clearPlayHistory()
							confirmClear = false
						}}
					>
						{m.common_confirm()}
					</button>
					<button onclick={() => (confirmClear = false)}>{m.common_cancel()}</button>
				{:else}
					<button onclick={() => (confirmClear = true)}>{m.queue_clear_history_button()}</button>
				{/if}
			</div>
			<div class="play-actions">
				<button type="button" onclick={playHistory}><Icon icon="play-fill" size={16} />{m.common_play()}</button>
				<button type="button" onclick={queueHistory}><Icon icon="next-fill" size={16} />{m.common_queue()}</button>
			</div>
		</div>
	{/if}

	{#if historyQuery.isLoading}
		<p class="constrained">{m.common_loading()}</p>
	{:else if history.length === 0}
		<p class="constrained">{m.history_empty()}</p>
	{:else}
		{#each days as day (day.key)}
			<h2>{dayLabel(day.plays[0].started_at, locale)}</h2>
			<ul class="list">
				{#each day.plays as play (play.id)}
					{@const reason = startReasons[play.reason_start as PlayStartReason]}
					<li onclick={() => (selectedId = play.id)}>
						<span class="play-time">
							<DateTime date={play.started_at} {locale} />
						</span>
						<span class="reason-icon" title={reason?.label()}>
							{#if reason}<Icon icon={reason.icon} size={13} />{/if}
						</span>
						<div class="track-wrap">
							<TrackCard
								track={toTrack(play)}
								selected={selectedId === play.id}
								showSlug={true}
								onPlay={() => playHistoryTrack(play)}
								onQueue={() => queueHistoryTrack(play)}
							>
								{#snippet description()}
									{#if play.ms_played || play.skipped || play.shuffle}
										<span class="play-metas">
											{#if play.ms_played}<span class="play-meta">{formatDurationCompact(play.ms_played)}</span>{/if}
											{#if play.skipped}<span class="play-meta">{m.history_flag_skipped()}</span>{/if}
											{#if play.shuffle}<span class="play-meta">{m.history_flag_shuffled()}</span>{/if}
										</span>
									{/if}
								{/snippet}
							</TrackCard>
						</div>
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</article>

<style>
	header {
		margin-bottom: 1rem;
	}

	.header-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 var(--space-3) 0.5rem;
	}

	.play-actions,
	.clear-actions {
		display: flex;
		gap: 0.5rem;
	}

	h2 {
		padding: 1rem var(--space-3) 0.25rem;
		text-transform: capitalize;
	}

	li {
		display: grid;
		grid-template-columns: 3.5rem 1.5rem 1fr;
		align-items: center;
		overflow: hidden;
	}

	.track-wrap {
		min-width: 0;
	}

	.play-metas {
		display: inline-flex;
		gap: 0.3rem;
	}

	.play-meta {
		font-size: var(--font-2);
		color: var(--gray-9);
	}

	.play-time {
		font-size: var(--font-2);
		color: var(--gray-10);
		font-variant-numeric: tabular-nums;
		text-align: right;
		padding-right: 0.25rem;
	}

	.reason-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-9);
	}
</style>
