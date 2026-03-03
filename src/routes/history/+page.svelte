<script lang="ts">
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {playHistoryCollection} from '$lib/collections/play-history'
	import {clearPlayHistory} from '$lib/collections/play-history'
	import {tracksCollection} from '$lib/collections/tracks'
	import {playTrack, setPlaylist, addToPlaylist, playNext} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import type {Track, PlayStartReason} from '$lib/types'
	import {parseUrl} from 'media-now'
	import {getLocale} from '$lib/paraglide/runtime'
	import {SvelteSet} from 'svelte/reactivity'

	const historyQuery = useLiveQuery((q) =>
		q.from({history: playHistoryCollection}).orderBy(({history}) => history.started_at, 'desc')
	)

	let history = $derived(historyQuery.data || [])

	function dayKey(dateStr: string) {
		return new Date(dateStr).toLocaleDateString(undefined, {year: 'numeric', month: '2-digit', day: '2-digit'})
	}

	function dayLabel(dateStr: string) {
		const date = new Date(dateStr)
		const now = Date.now()
		const todayKey = dayKey(new Date(now).toISOString())
		const yesterdayKey = dayKey(new Date(now - 86400000).toISOString())
		if (dayKey(dateStr) === todayKey) return 'Today'
		if (dayKey(dateStr) === yesterdayKey) return 'Yesterday'
		const isThisYear = date.getFullYear() === new Date(now).getFullYear()
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(isThisYear ? {} : {year: 'numeric'})
		})
	}

	let days = $derived.by(() => {
		const result: {key: string; label: string; plays: typeof history}[] = []
		for (const play of history) {
			const key = dayKey(play.started_at)
			if (result.length === 0 || result.at(-1)!.key !== key) {
				result.push({key, label: dayLabel(play.started_at), plays: []})
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

	function playTime(dateStr: string) {
		const locale = appState.language || getLocale()
		return new Date(dateStr).toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit', second: '2-digit'})
	}

	function formatMs(ms: number) {
		const s = Math.round(ms / 1000)
		if (s < 60) return `${s}s`
		const m = Math.floor(s / 60)
		const rem = s % 60
		return rem ? `${m}m${rem}s` : `${m}m`
	}

	// Shown below each track (except the last/oldest): explains how we got from the
	// track below to this one. Reading top-to-bottom: Track A → [connector] → Track B.
	const startReasons: Partial<Record<PlayStartReason, {icon: string; label: string}>> = {
		play_channel: {icon: 'radio', label: 'Played channel'},
		play_search: {icon: 'search', label: 'Played from search'},
		user_click_track: {icon: 'hand-pointer', label: 'Played'},
		user_next: {icon: 'next-fill', label: 'Next'},
		user_prev: {icon: 'previous-fill', label: 'Previous'},
		auto_next: {icon: 'next-fill', label: 'Track ended'},
		broadcast_sync: {icon: 'signal', label: 'Broadcast'}
	}

	let selectedId = $state<string | null>(null)
	let confirmClear = $state(false)
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
				<button type="button" onclick={playHistory}><Icon icon="play-fill" size={16} />Play</button>
				<button type="button" onclick={queueHistory}><Icon icon="next-fill" size={16} />Queue</button>
			</div>
		</div>
	{/if}

	{#if historyQuery.isLoading}
		<p class="constrained">{m.common_loading()}</p>
	{:else if history.length === 0}
		<p class="constrained">{m.history_empty()}</p>
	{:else}
		{#each days as day (day.key)}
			<h2>{day.label}</h2>
			<ul class="list">
				{#each day.plays as play (play.id)}
					{@const reason = startReasons[play.reason_start as PlayStartReason]}
					<li onclick={() => (selectedId = play.id)}>
						<time class="play-time">{playTime(play.started_at)}</time>
						<span class="reason-icon" title={reason?.label}>
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
									{#if play.ms_played}<span class="play-meta">{formatMs(play.ms_played)}</span>{/if}
									{#if play.skipped}<span class="play-meta">{m.history_flag_skipped()}</span>{/if}
									{#if play.shuffle}<span class="play-meta">{m.history_flag_shuffled()}</span>{/if}
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
