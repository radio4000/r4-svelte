<script lang="ts">
	import {resolve} from '$app/paths'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {
		captureEventsCollection,
		clearCaptureEvents,
		buildEndDataMap,
		type CaptureEvent
	} from '#lib/collections/capture-events.js'
	import {playTrack} from '#lib/api.js'
	import {ensureTracksLoaded} from '#lib/collections/tracks.js'
	import {appState} from '#lib/app-state.svelte.js'
	import * as m from '#lib/paraglide/messages.js'
	import {getLocale} from '#lib/paraglide/runtime.js'
	import {dayLabel, formatDurationCompact} from '#lib/dates.js'
	import {getPlayCountThreshold} from '#lib/utils.js'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import TrackCard from '#lib/components/track-card.svelte'
	import ChannelMicroCard from '#lib/components/channel-micro-card.svelte'
	import DateTime from '#lib/components/date-time.svelte'
	import BackLink from '#lib/components/back-link.svelte'
	import Icon from '#lib/components/icon.svelte'
	import Seo from '#lib/components/seo.svelte'
	import type {Track, PlayStartReason} from '#lib/types.js'
	import {parseUrl} from 'media-now'

	const eventsQuery = useLiveQuery((q) =>
		q.from({ev: captureEventsCollection}).orderBy(({ev}) => ev.created_at, 'desc')
	)

	let allEvents = $derived(eventsQuery.data || [])

	// Event type filter
	let eventTypes = $derived([...new Set(allEvents.map((e) => e.event))].toSorted())
	let activeFilter = $state<string | null>(null)
	let filteredEvents = $derived(
		activeFilter ? allEvents.filter((e) => e.event === activeFilter) : allEvents
	)
	let isPlayView = $derived(activeFilter === 'player:track_play')

	// Play-specific derived data
	let playEvents = $derived(allEvents.filter((e) => e.event === 'player:track_play'))
	let endDataByPlayId = $derived(buildEndDataMap(allEvents, playEvents))

	// Group by day
	let days = $derived.by(() => {
		const result: {key: string; events: CaptureEvent[]}[] = []
		for (const ev of filteredEvents) {
			const key = new Date(ev.created_at).toDateString()
			if (result.length === 0 || result.at(-1)!.key !== key) {
				result.push({key, events: []})
			}
			result.at(-1)!.events.push(ev)
		}
		return result
	})

	function toTrack(play: CaptureEvent): Track {
		const p = play.properties ?? {}
		const url = p.url as string
		const parsed = url ? parseUrl(url) : null
		return {
			id: p.track_id as string,
			title: p.title as string,
			url,
			slug: p.channel_slug as string,
			provider: parsed?.provider ?? null,
			media_id: parsed?.id ?? null,
			description: null,
			created_at: play.created_at,
			updated_at: play.created_at,
			discogs_url: null,
			duration: null,
			fts: null,
			mentions: null,
			playback_error: null,
			tags: null
		} as unknown as Track
	}

	function getTrackDurationSec(trackId: string): number | undefined {
		const duration = tracksCollection.get(trackId)?.duration
		return duration && duration > 0 ? duration : undefined
	}

	function isSkippedPlay(play: CaptureEvent, endData?: {ms_played?: number}): boolean {
		if (!endData) return false
		const trackId = play.properties?.track_id as string
		const thresholdMs = getPlayCountThreshold(getTrackDurationSec(trackId)) * 1000
		return (endData.ms_played ?? 0) < thresholdMs
	}

	async function playHistoryTrack(play: CaptureEvent) {
		const p = play.properties ?? {}
		const slug = p.channel_slug as string
		const trackId = p.track_id as string
		if (slug) await ensureTracksLoaded(slug)
		await playTrack(appState.active_deck_id, trackId, null, 'user_click_track')
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

	// Format event name for display: "player:track_play" → "track play"
	const shortEventRe = /^[^:]+:/
	function shortEventName(event: string) {
		return event.replace(shortEventRe, '').replaceAll('_', ' ')
	}

	// Property keys worth hiding from the table (already visible elsewhere)
	const hiddenProps = new Set(['play_id'])

	let confirmClear = $state(false)

	const locale = $derived(appState.language || getLocale())
</script>

<Seo title={m.page_title_history()} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.history_title()}</h1>
	</header>

	<p>
		{m.history_local_note()}
		- <a href="/settings/analytics">{m.history_analytics_link()}</a>
	</p>

	{#if allEvents.length > 0}
		<menu class="header-actions">
			<menu class="filters">
				<button class:active={!activeFilter} onclick={() => (activeFilter = null)}>
					{m.history_filter_all({count: allEvents.length})}
				</button>
				{#each eventTypes as type (type)}
					<button
						class:active={activeFilter === type}
						onclick={() => (activeFilter = activeFilter === type ? null : type)}
					>
						{shortEventName(type)} ({allEvents.filter((e) => e.event === type).length})
					</button>
				{/each}
			</menu>
			<menu class="clear-actions">
				{#if confirmClear}
					<button
						class="danger"
						onclick={() => {
							clearCaptureEvents()
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
</article>

{#if eventsQuery.isLoading}
	<p class="focused constrained">{m.common_loading()}</p>
{:else if allEvents.length === 0}
	<p class="focused constrained">{m.history_empty()}</p>
{:else if filteredEvents.length === 0}
	<p class="focused constrained">{m.history_no_events_filtered({filter: activeFilter ?? ''})}</p>
{:else}
	<article>
		{#each days as day (day.key)}
			<h2>{dayLabel(day.events[0].created_at, locale)}</h2>

			{#if isPlayView}
				<ul class="list">
					{#each day.events as play (play.id)}
						{@const p = play.properties ?? {}}
						{@const endData = endDataByPlayId.get(play.id)}
						{@const skipped = isSkippedPlay(play, endData)}
						{@const reason = getStartReason(p.start_reason as string)}
						{@const histTrack = toTrack(play)}
						<li class="play-row" class:skipped>
							<small class="play-time">
								<DateTime date={play.created_at} {locale} />
							</small>
							<span class="reason-icon" title={reason?.label?.()}>
								{#if reason}<Icon icon={reason.icon} size={13} />{/if}
							</span>
							<div class="track-col">
								<TrackCard track={histTrack} onPlay={() => playHistoryTrack(play)}>
									{#snippet description()}
										{#if endData?.ms_played || p.shuffle || skipped}
											<small class="play-metas">
												{#if endData?.ms_played}<span class="play-meta"
														>{formatDurationCompact(endData.ms_played)}</span
													>{/if}
												{#if skipped}<span class="play-meta">{m.history_flag_skipped()}</span>{/if}
												{#if p.shuffle}<span class="play-meta">{m.history_flag_shuffled()}</span
													>{/if}
											</small>
										{/if}
									{/snippet}
								</TrackCard>
								<ChannelMicroCard slug={histTrack.slug} />
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<table>
					<thead>
						<tr>
							<th>{m.history_col_time()}</th>
							<th>{m.history_col_event()}</th>
							<th>{m.history_col_properties()}</th>
						</tr>
					</thead>
					<tbody>
						{#each day.events as ev (ev.id)}
							{@const props = ev.properties ?? {}}
							{@const entries = Object.entries(props).filter(([k]) => !hiddenProps.has(k))}
							<tr>
								<td class="cell-time">
									<DateTime date={ev.created_at} {locale} />
								</td>
								<td class="cell-event">
									<code>{shortEventName(ev.event)}</code>
								</td>
								<td class="cell-props">
									{#each entries as [key, val], i (key)}
										<span class="prop"
											><span class="prop-key">{key}</span>
											<span class="prop-val">{val}</span></span
										>{#if i < entries.length - 1}{/if}
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/each}
	</article>
{/if}

<style>
	.header-actions {
		padding-inline: 0.5rem;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: 0;

		button {
			font-size: var(--font-2);
			min-height: unset;
			padding: var(--space-1) 0.5rem;
		}
	}

	h2 {
		text-transform: capitalize;
		margin: var(--space-3);
	}

	/* Play view (track cards) */
	.play-row {
		display: grid;
		grid-template-columns: min-content 1.5rem 1fr;
		padding-left: 0.5rem;
		align-items: center;
		overflow: hidden;
	}

	.play-row.skipped {
		opacity: 0.55;
	}

	.track-col {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		overflow: hidden;
		padding-inline: 0.5rem;
	}

	.track-col :global(article) {
		flex: 1;
		min-width: 0;
	}

	.track-col :global(.card) {
		padding-inline-start: 0;
	}

	.play-time {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.play-metas {
		display: inline-flex;
		gap: var(--space-1);
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

	/* Table view (all events) */
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-3);
	}

	thead {
		text-align: left;
	}

	th {
		border-bottom: 1px solid var(--color-interface-border);
		padding: var(--space-1) 0.5rem;
		font-weight: 500;
		color: var(--gray-10);
		text-transform: uppercase;
		font-size: var(--font-1);
		letter-spacing: 0.04em;
	}

	td {
		padding: var(--space-1) 0.5rem;
		vertical-align: top;
		border-bottom: 1px solid var(--gray-3);
	}

	@media (hover: hover) and (pointer: fine) {
		tr:hover td {
			background: var(--gray-2);
		}
	}

	.cell-time {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--gray-10);
	}

	.cell-event code {
		font-size: var(--font-2);
	}

	.cell-props {
		word-break: break-all;
	}

	.prop {
		display: inline;
	}

	.prop-key {
		color: var(--gray-9);
	}

	.prop-key::after {
		content: '=';
	}

	.prop-val {
		color: var(--gray-12);
	}
</style>
