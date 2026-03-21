<script lang="ts">
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {playHistoryCollection, clearPlayHistory, type PlayHistoryEntry} from '$lib/collections/play-history'
	import {playTrack} from '$lib/api'
	import {ensureTracksLoaded} from '$lib/collections/tracks'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import {getLocale} from '$lib/paraglide/runtime'
	import {dayLabel, formatDurationCompact} from '$lib/dates.js'
	import TrackCard from '$lib/components/track-card.svelte'
	import DateTime from '$lib/components/date-time.svelte'
	import Icon from '$lib/components/icon.svelte'
	import type {Track, PlayStartReason} from '$lib/types'
	import {parseUrl} from 'media-now'

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

	function toTrack(play: PlayHistoryEntry): Track {
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

	async function playHistoryTrack(play: PlayHistoryEntry) {
		await ensureTracksLoaded(play.slug)
		await playTrack(appState.active_deck_id, play.track_id, null, 'user_click_track')
	}

	type StartReasonMeta = {icon: string; label: () => string}

	const startReasons = {
		play_channel: {icon: 'radio', label: m.history_reason_play_channel},
		play_search: {icon: 'search', label: m.history_reason_play_search},
		user_click_track: {icon: 'hand-pointer', label: m.history_reason_user_click_track},
		user_next: {icon: 'next-fill', label: m.history_reason_user_next},
		user_prev: {icon: 'previous-fill', label: m.history_reason_user_prev},
		auto_next: {icon: 'next-fill', label: m.history_reason_auto_next},
		broadcast_sync: {icon: 'signal', label: m.history_reason_broadcast_sync},
		track_error: {icon: 'warning', label: m.history_reason_track_error}
	} satisfies Partial<Record<PlayStartReason, StartReasonMeta>>

	function getStartReason(reasonStart?: string): StartReasonMeta | null {
		if (!reasonStart || !Object.hasOwn(startReasons, reasonStart)) return null
		return startReasons[reasonStart as keyof typeof startReasons] ?? null
	}

	let confirmClear = $state(false)

	const locale = $derived(appState.language || getLocale())
</script>

<svelte:head>
	<title>{m.page_title_history()}</title>
</svelte:head>

<article class="focused">
	<header class="constrained">
		<h1>{m.history_title()}</h1>
		<p>{m.history_local_note()}</p>
	</header>
	{#if history.length > 0}
		<menu class="header-actions">
			<menu class="clear-actions">
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
			</menu>
		</menu>
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
					{@const reason = getStartReason(play.reason_start)}
					<li>
						<small class="play-time">
							<DateTime date={play.started_at} {locale} />
						</small>
						<span class="reason-icon" title={reason?.label?.()}>
							{#if reason}<Icon icon={reason.icon} size={13} />{/if}
						</span>
						<TrackCard track={toTrack(play)} showSlug={true} onPlay={() => playHistoryTrack(play)}>
							{#snippet description()}
								{#if play.ms_played || play.skipped || play.shuffle}
									<small class="play-metas">
										{#if play.ms_played}<span class="play-meta">{formatDurationCompact(play.ms_played)}</span>{/if}
										{#if play.skipped}<span class="play-meta">{m.history_flag_skipped()}</span>{/if}
										{#if play.shuffle}<span class="play-meta">{m.history_flag_shuffled()}</span>{/if}
									</small>
								{/if}
							{/snippet}
						</TrackCard>
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</article>

<style>
	.header-actions {
		padding-inline-start: 0.5rem;
		justify-content: space-between;
	}

	h2 {
		text-transform: capitalize;
		margin: var(--space-3);
	}

	li {
		display: grid;
		grid-template-columns: min-content 1.5rem 1fr;
		padding-left: 0.5rem;
		align-items: center;
		overflow: hidden;
	}

	.play-time {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.play-metas {
		display: inline-flex;
		gap: 0.3rem;
	}

	.reason-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-10);

		:global(svg) {
			width: 1rem;
			height: 1rem;
		}
	}
</style>
