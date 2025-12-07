<script>
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'
	import {getLocale} from '$lib/paraglide/runtime'
	import {
		playHistoryCollection,
		channelsCollection,
		trackMetaCollection,
		followsCollection,
		queryClient
	} from '../tanstack/collections'
	import SyncStatus from '../tanstack/sync-status.svelte'

	// Derive data reactively from collections
	const plays = $derived([...playHistoryCollection.state.values()])
	const channels = $derived([...channelsCollection.state.values()])
	const trackMeta = $derived([...trackMetaCollection.state.values()])
	const follows = $derived([...followsCollection.state.values()])

	// Query cache stats (tracks are loaded on-demand per slug, so state may be empty)
	const tracksCached = $derived(
		queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === 'tracks')
			.reduce((sum, q) => sum + (Array.isArray(q.state.data) ? q.state.data.length : 0), 0)
	)
	const channelsCached = $derived(
		queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === 'channels')
			.reduce((sum, q) => sum + (Array.isArray(q.state.data) ? q.state.data.length : 0), 0)
	)

	// Storage estimate
	/** @type {{usage?: number, quota?: number} | null} */
	let storageEstimate = $state(null)
	$effect(() => {
		navigator.storage?.estimate?.().then((est) => (storageEstimate = est))
	})

	/** @param {number} bytes */
	function formatBytes(bytes) {
		if (bytes < 1024) return bytes + ' B'
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
		return (bytes / 1024 / 1024).toFixed(1) + ' MB'
	}

	// Build lookup maps
	const channelBySlug = $derived(
		channels.reduce((acc, c) => {
			acc[c.slug] = c
			return acc
		}, {})
	)

	// Basic stats
	const totalPlays = $derived(plays.length)
	const totalListeningTime = $derived(Math.round(plays.reduce((sum, p) => sum + (p.ms_played || 0), 0) / 1000 / 60))
	const uniqueTracks = $derived(new Set(plays.map((p) => p.track_id)).size)
	const uniqueChannels = $derived(new Set(plays.map((p) => p.slug)).size)
	const skipRate = $derived(
		plays.length > 0 ? Math.round((plays.filter((p) => p.skipped).length / plays.length) * 100) : 0
	)

	// Collection stats
	const totalChannelsInDb = $derived(channels.length)
	const tracksWithMeta = $derived(trackMeta.length)

	// Channel timeline (by creation month)
	const channelTimeline = $derived.by(() => {
		const monthlyChannels = {}
		channels
			.filter((c) => c.created_at)
			.forEach((c) => {
				if (!c.created_at) return
				const createdAt = new Date(c.created_at)
				const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-01`
				monthlyChannels[monthKey] = (monthlyChannels[monthKey] || 0) + 1
			})

		return Object.entries(monthlyChannels)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, count]) => ({month, count}))
	})

	// Recently played (unique tracks from last 7 days)
	const recentlyPlayed = $derived.by(() => {
		const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
		const recentTracks = {}
		plays
			.filter((p) => new Date(p.started_at).getTime() > sevenDaysAgoMs)
			.forEach((p) => {
				const playTime = new Date(p.started_at).getTime()
				const existingTime = recentTracks[p.track_id] ? new Date(recentTracks[p.track_id].started_at).getTime() : 0
				if (!recentTracks[p.track_id] || playTime > existingTime) {
					const channel = channelBySlug[p.slug]
					recentTracks[p.track_id] = {
						id: p.track_id,
						title: p.title,
						channel_name: channel?.name,
						slug: p.slug,
						started_at: p.started_at
					}
				}
			})
		return Object.values(recentTracks)
			.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
			.slice(0, 3)
	})

	// Most replayed tracks (top 3)
	const mostReplayedTrack = $derived.by(() => {
		const trackPlays = {}
		plays.forEach((p) => {
			const key = p.track_id
			if (!trackPlays[key]) {
				const channel = channelBySlug[p.slug]
				trackPlays[key] = {
					title: p.title,
					channel_name: channel?.name,
					slug: p.slug,
					track_id: p.track_id,
					play_count: 0
				}
			}
			trackPlays[key].play_count++
		})
		return Object.values(trackPlays)
			.sort((a, b) => b.play_count - a.play_count)
			.slice(0, 3)
	})

	// Listening patterns
	const daysSinceFirstPlay = $derived.by(() => {
		if (plays.length === 0) return 0
		const playTimes = plays.map((p) => new Date(p.started_at).getTime())
		const firstPlayMs = Math.min(...playTimes)
		return Math.floor((Date.now() - firstPlayMs) / (1000 * 60 * 60 * 24))
	})

	const streakDays = $derived.by(() => {
		if (plays.length === 0) return 0
		const dates = plays.map((p) => new Date(p.started_at).toDateString())
		return new Set(dates).size
	})

	const mostActiveHour = $derived.by(() => {
		if (plays.length === 0) return null
		const hourCounts = {}
		plays.forEach((p) => {
			const hour = new Date(p.started_at).getHours()
			hourCounts[hour] = (hourCounts[hour] || 0) + 1
		})
		const sortedHours = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)
		return sortedHours.length > 0 ? Number(sortedHours[0][0]) : null
	})

	// Reason analytics
	const startReasons = $derived.by(() => {
		const reasons = {}
		plays.forEach((p) => {
			if (p.reason_start) reasons[p.reason_start] = (reasons[p.reason_start] || 0) + 1
		})
		return Object.entries(reasons)
			.sort(([, a], [, b]) => b - a)
			.map(([reason, count]) => ({reason, count}))
	})

	const endReasons = $derived.by(() => {
		const reasons = {}
		plays.forEach((p) => {
			if (p.reason_end) reasons[p.reason_end] = (reasons[p.reason_end] || 0) + 1
		})
		return Object.entries(reasons)
			.sort(([, a], [, b]) => b - a)
			.map(([reason, count]) => ({reason, count}))
	})

	const userInitiatedReasons = ['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search']
	const userInitiatedRate = $derived.by(() => {
		if (plays.length === 0) return 0
		const userInitiated = plays.filter((p) => p.reason_start && userInitiatedReasons.includes(p.reason_start)).length
		return Math.round((userInitiated / plays.length) * 100)
	})
</script>

<svelte:head>
	<title>{m.page_title_stats()}</title>
</svelte:head>

<article class="SmallContainer">
	<menu>
		<a class="btn" href="/stats" class:active={page.route.id === '/stats'}>
			<Icon icon="chart-scatter" size={20} />
			{m.nav_stats()}
		</a>
		<a class="btn" href="/history" class:active={page.route.id === '/history'}>
			<Icon icon="history" size={20} />
			{m.nav_history()}
		</a>
	</menu>

	<header>
		<h1>{m.stats_heading()}</h1>
		<p>{m.stats_intro()}</p>
	</header>

	<section>
		<header>
			<h2>{m.stats_activity_heading()}</h2>
		</header>

		<p>
			{m.stats_counts_summary({
				channels: uniqueChannels.toLocaleString(),
				tracks: uniqueTracks.toLocaleString(),
				plays: totalPlays.toLocaleString()
			})}
		</p>

		<p>
			{m.stats_time_summary({
				hours: Math.floor(totalListeningTime / 60),
				minutes: totalListeningTime % 60,
				skipRate: skipRate
			})}
		</p>

		{#if daysSinceFirstPlay > 0}
			<p>
				{m.stats_listening_duration({
					days: daysSinceFirstPlay,
					activeDays: streakDays
				})}
			</p>
		{/if}

		{#if mostActiveHour !== null}
			<p>{m.stats_most_active({hour: mostActiveHour})}</p>
		{/if}

		{#if userInitiatedRate > 0}
			<p>
				{m.stats_user_share({
					userRate: userInitiatedRate,
					autoRate: 100 - userInitiatedRate
				})}
			</p>
		{/if}
	</section>

	{#if mostReplayedTrack.length > 0}
		<section>
			<header>
				<h2>{m.stats_on_repeat_heading()}</h2>
			</header>
			<ol>
				{#each mostReplayedTrack as track (track.track_id)}
					<li>
						<a href="/{track.slug}">@{track.slug}</a>
						&rarr;
						<a href={`/${track.slug}/${track.track_id}`}>
							<em>{track.title}</em>
						</a>
						• {m.stats_play_count({count: track.play_count})}
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if recentlyPlayed.length > 0}
		<section>
			<header>
				<h2>{m.stats_recent_heading()}</h2>
			</header>
			<ol>
				{#each recentlyPlayed as track (track.id)}
					<li>
						<a href="/{track.slug}">@{track.slug}</a>
						&rarr;
						<a href={`/${track.slug}/${track.id}`}>
							<em>{track.title}</em>
						</a>
					</li>
				{/each}
			</ol>
			<p style="text-align:right"><a href="/history">{m.stats_history_link()}</a></p>
		</section>
	{/if}

	{#if startReasons.length > 0}
		<section>
			<div class="reasons">
				<div>
					<header>
						<h2>{m.stats_play_reasons_heading()}</h2>
					</header>
					{#each startReasons.slice(0, 5) as { reason, count } (reason)}
						<div class="reason-line">
							{reason}
							{count}
						</div>
					{/each}
				</div>
				<div>
					<header>
						<h2>{m.stats_stop_reasons_heading()}</h2>
					</header>
					{#each endReasons.slice(0, 5) as { reason, count } (reason)}
						<div class="reason-line">
							{reason}
							{count}
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<section>
		<header>
			<h2>local system</h2>
		</header>

		<SyncStatus />

		<dl class="meta">
			<dt>channels</dt>
			<dd>{channelsCached.toLocaleString()}</dd>
			<dt>tracks</dt>
			<dd>{tracksCached.toLocaleString()}</dd>
			<dt>track metadata</dt>
			<dd>{tracksWithMeta.toLocaleString()}</dd>
			<dt>play history</dt>
			<dd>{plays.length.toLocaleString()}</dd>
			<dt>follows</dt>
			<dd>{follows.length.toLocaleString()}</dd>
		</dl>

		{#if storageEstimate?.usage}
			<p class="storage">
				Storage: {formatBytes(storageEstimate.usage)}
				{#if storageEstimate.quota}
					/ {formatBytes(storageEstimate.quota)}
				{/if}
			</p>
		{/if}
	</section>

	{#if channelTimeline.length > 1}
		{@const max = Math.max(...channelTimeline.map((m) => m.count))}
		<section>
			<div class="timeline">
				{#each channelTimeline as month, i (i)}
					{@const dateLabel = new Intl.DateTimeFormat(getLocale() ?? 'en', {
						month: 'short',
						year: 'numeric'
					}).format(new Date(month.month))}
					<div
						class="bar"
						style="height: {(month.count / max) * 100}%"
						title={m.stats_timeline_tooltip({
							date: dateLabel,
							count: month.count
						})}
					></div>
				{/each}
			</div>
			<header>
				<h2 style="text-align:right">
					{m.stats_timeline_heading({count: totalChannelsInDb.toLocaleString()})}
				</h2>
			</header>
		</section>
		<br />
	{/if}
</article>

<style>
	article {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	section {
		p,
		ol {
			margin: 0 0.5rem;
		}
		ol {
			margin: 0 0.5rem;
			padding-left: 1rem;
		}
	}

	section header {
		border-bottom: 1px solid var(--gray-5);

		h2 {
			text-transform: uppercase;
		}
	}

	.timeline {
		display: flex;
		align-items: flex-end;
		height: 60px;
		gap: 2px;
		padding: 0.5rem;

		.bar {
			flex: 1;
			background: var(--accent-9);
			min-height: 2px;
			transition:
				height 200ms,
				opacity 0.2s;

			&:hover {
				height: 0 !important;
			}
		}
	}

	.reasons {
		display: flex;
		gap: 0rem;
		padding: 0rem;
	}

	.reason-line {
		display: flex;
		justify-content: space-between;
		min-width: 12em;
	}

	.storage {
		color: var(--gray-10);
		font-size: 0.85em;
	}
</style>
