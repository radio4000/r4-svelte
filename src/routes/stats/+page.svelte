<script>
	import {onMount} from 'svelte'
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import {getChannelsCollection, getTracksCollection, playHistoryCollection} from '$lib/collections'
	import {extractHashtags} from '$lib/utils.ts'

	let stats = $state({
		totalPlays: 0,
		totalListeningTime: 0,
		uniqueTracks: 0,
		uniqueChannels: 0,
		topTags: [],
		topChannels: [],
		temporalPatterns: null,
		skipRate: 0,
		// DB stats
		totalChannelsInDb: 0,
		totalTracksInDb: 0,
		tracksWithoutMeta: 0,
		avgTracksPerChannel: 0,
		channelTimeline: [],
		recentlyPlayed: [],
		// Track stats
		mostReplayedTrack: null,
		// Patterns
		daysSinceFirstPlay: 0,
		streakDays: 0,
		mostActiveHour: null,
		// Reason analytics
		startReasons: [],
		endReasons: [],
		userInitiatedRate: 0
	})

	let ready = $state(false)

	onMount(async () => {
		await generateStats()
		ready = true
	})

	async function generateStats() {
		try {
			// Get data from collections
			const channelsCollection = getChannelsCollection()
			const tracksCollection = getTracksCollection()

			const channels = channelsCollection.toArray
			const tracks = tracksCollection.toArray
			const playHistory = playHistoryCollection.toArray

			// Create lookup maps for client-side joins
			const trackMap = new Map(tracks.map((t) => [t.id, t]))
			const channelMap = new Map(channels.map((c) => [c.id, c]))

			// Join play history with tracks and channels
			const plays = playHistory
				.map((ph) => {
					const track = trackMap.get(ph.track_id)
					const channel = track ? channelMap.get(track.channel_id) : null
					return {
						...ph,
						title: track?.title,
						duration: track?.duration,
						description: track?.description,
						channel_id: track?.channel_id,
						channel_name: channel?.name,
						channel_slug: channel?.slug
					}
				})
				.filter((p) => p.title) // Only include plays where track was found

			// Basic stats
			stats.totalPlays = plays.length
			stats.totalListeningTime = Math.round(plays.reduce((sum, p) => sum + p.ms_played, 0) / 1000 / 60)
			stats.uniqueTracks = new Set(plays.map((p) => p.track_id)).size
			stats.uniqueChannels = new Set(plays.map((p) => p.channel_id)).size
			stats.skipRate = Math.round((plays.filter((p) => p.skipped).length / plays.length) * 100)

			// Channel stats
			const channelPlays = {}
			plays.forEach((play) => {
				if (!channelPlays[play.channel_id]) {
					channelPlays[play.channel_id] = {
						id: play.channel_id,
						name: play.channel_name,
						slug: play.channel_slug,
						plays: 0,
						total_listening_ms: 0,
						completions: []
					}
				}
				const ch = channelPlays[play.channel_id]
				ch.plays++
				ch.total_listening_ms += play.ms_played
				if (play.duration > 0) {
					ch.completions.push(play.ms_played / play.duration)
				}
			})

			stats.topChannels = Object.values(channelPlays)
				.sort((a, b) => b.plays - a.plays)
				.slice(0, 8)
				.map((ch) => ({
					...ch,
					completion_rate:
						ch.completions.length > 0
							? Math.round((ch.completions.reduce((a, b) => a + b, 0) / ch.completions.length) * 100)
							: 0
				}))

			// Extract hashtags
			const allTags = plays
				.filter((p) => p.description)
				.flatMap((p) => extractHashtags(p.description))
				.reduce((acc, tag) => {
					acc[tag] = (acc[tag] || 0) + 1
					return acc
				}, {})

			stats.topTags = Object.entries(allTags)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 20)
				.map(([tag, count]) => ({tag, count}))

			// Database stats
			stats.totalChannelsInDb = channels.length
			stats.totalTracksInDb = tracks.length
			stats.tracksWithoutMeta = tracks.filter((t) => !t.duration || !t.title).length

			// Average tracks per channel
			const tracksByChannel = {}
			tracks.forEach((t) => {
				tracksByChannel[t.channel_id] = (tracksByChannel[t.channel_id] || 0) + 1
			})
			const trackCounts = Object.values(tracksByChannel)
			stats.avgTracksPerChannel =
				trackCounts.length > 0 ? Math.round((trackCounts.reduce((a, b) => a + b, 0) / trackCounts.length) * 10) / 10 : 0

			// Channel timeline
			const monthlyChannels = {}
			channels
				.filter((c) => c.created_at)
				.forEach((c) => {
					const createdAt = new Date(c.created_at)
					const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-01`
					monthlyChannels[monthKey] = (monthlyChannels[monthKey] || 0) + 1
				})

			stats.channelTimeline = Object.entries(monthlyChannels)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([month, count]) => ({month, count}))

			// Recently played (unique tracks from last 7 days)
			const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
			const recentTracks = {}
			plays
				.filter((p) => new Date(p.started_at).getTime() > sevenDaysAgoMs)
				.forEach((p) => {
					const playTime = new Date(p.started_at).getTime()
					const existingTime = recentTracks[p.track_id] ? new Date(recentTracks[p.track_id].started_at).getTime() : 0
					if (!recentTracks[p.track_id] || playTime > existingTime) {
						recentTracks[p.track_id] = {
							id: p.track_id,
							title: p.title,
							channel_name: p.channel_name,
							channel_slug: p.channel_slug,
							started_at: p.started_at
						}
					}
				})
			stats.recentlyPlayed = Object.values(recentTracks)
				.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
				.slice(0, 3)

			// Most replayed tracks (top 3)
			const trackPlays = {}
			plays.forEach((p) => {
				const key = p.track_id
				if (!trackPlays[key]) {
					trackPlays[key] = {
						title: p.title,
						channel_name: p.channel_name,
						channel_slug: p.channel_slug,
						track_id: p.track_id,
						play_count: 0
					}
				}
				trackPlays[key].play_count++
			})
			stats.mostReplayedTrack = Object.values(trackPlays)
				.sort((a, b) => b.play_count - a.play_count)
				.slice(0, 3)

			// Listening streak and patterns
			if (plays.length > 0) {
				const dates = plays.map((p) => new Date(p.started_at).toDateString())
				const uniqueDays = new Set(dates)
				const playTimes = plays.map((p) => new Date(p.started_at).getTime())
				const firstPlayMs = Math.min(...playTimes)
				const daysSince = Math.floor((Date.now() - firstPlayMs) / (1000 * 60 * 60 * 24))
				stats.daysSinceFirstPlay = daysSince
				stats.streakDays = uniqueDays.size

				// Most active hour
				const hourCounts = {}
				plays.forEach((p) => {
					const hour = new Date(p.started_at).getHours()
					hourCounts[hour] = (hourCounts[hour] || 0) + 1
				})
				const sortedHours = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)
				if (sortedHours.length > 0) {
					stats.mostActiveHour = Number(sortedHours[0][0])
				}

				// Temporal patterns
				const patterns = {}
				plays.forEach((p) => {
					const playDate = new Date(p.started_at)
					const hour = playDate.getHours()
					const dow = playDate.getDay()
					const key = `${hour}-${dow}`
					if (!patterns[key]) {
						patterns[key] = {
							hour,
							day_of_week: dow,
							plays: 0,
							completions: []
						}
					}
					patterns[key].plays++
					if (p.duration > 0) {
						patterns[key].completions.push(p.ms_played / p.duration)
					}
				})
				stats.temporalPatterns = Object.values(patterns)
					.map((p) => ({
						...p,
						avg_completion:
							p.completions.length > 0 ? p.completions.reduce((a, b) => a + b, 0) / p.completions.length : 0
					}))
					.sort((a, b) => b.plays - a.plays)

				// Reason analytics
				const startReasons = {}
				const endReasons = {}
				plays.forEach((p) => {
					if (p.reason_start) {
						startReasons[p.reason_start] = (startReasons[p.reason_start] || 0) + 1
					}
					if (p.reason_end) {
						endReasons[p.reason_end] = (endReasons[p.reason_end] || 0) + 1
					}
				})
				stats.startReasons = Object.entries(startReasons)
					.sort(([, a], [, b]) => b - a)
					.map(([reason, count]) => ({reason, count}))
				stats.endReasons = Object.entries(endReasons)
					.sort(([, a], [, b]) => b - a)
					.map(([reason, count]) => ({reason, count}))

				// User vs auto listening
				const userInitiated = plays.filter((p) =>
					['user_click_track', 'user_next', 'user_prev', 'play_channel', 'play_search'].includes(p.reason_start)
				).length
				stats.userInitiatedRate = Math.round((userInitiated / plays.length) * 100)
			}
		} catch (err) {
			console.error('Stats generation failed:', err)
		}
	}
</script>

<svelte:head>
	<title>R5 / Stats</title>
</svelte:head>

<article class="SmallContainer">
	<menu>
		<a class="btn" href="/stats" class:active={page.route.id === '/stats'}>
			<Icon icon="chart-scatter" size={20} /> Stats
		</a>
		<a class="btn" href="/history" class:active={page.route.id === '/history'}>
			<Icon icon="history" size={20} /> History
		</a>
	</menu>

	<header>
		<h1>Statistics</h1>
		<p>Statistics from your local data and play history.</p>
	</header>

	{#if !ready}
		<section>
			<header>
				<h2>activity preparing, i am</h2>
			</header>
		</section>
	{:else}
		<section>
			<header>
				<h2>activity</h2>
			</header>

			<p>
				<strong>{stats.uniqueChannels.toLocaleString()}</strong> radios •
				<strong>{stats.uniqueTracks.toLocaleString()}</strong> tracks •
				<strong>{stats.totalPlays.toLocaleString()}</strong> plays
			</p>

			<p>
				{Math.floor(stats.totalListeningTime / 60)}h {stats.totalListeningTime % 60}m total •
				{stats.skipRate}% skipped
			</p>

			{#if stats.daysSinceFirstPlay > 0}
				<p>
					listening for {stats.daysSinceFirstPlay} days • active on {stats.streakDays} of them
				</p>
			{/if}

			{#if stats.mostActiveHour !== null}
				<p>most active around {stats.mostActiveHour}:00</p>
			{/if}

			{#if stats.userInitiatedRate > 0}
				<p>{stats.userInitiatedRate}% user-initiated • {100 - stats.userInitiatedRate}% automatic</p>
			{/if}
		</section>

		{#if stats.mostReplayedTrack.length > 0}
			<section>
				<header>
					<h2>on repeat</h2>
				</header>
				<ol>
					{#each stats.mostReplayedTrack as track (track.track_id)}
						<li>
							<a href="/{track.channel_slug}">@{track.channel_slug}</a>
							&rarr;
							<a href={`/${track.channel_slug}/${track.track_id}`}>
								<em>{track.title}</em>
							</a>
							• {track.play_count} plays
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if stats.recentlyPlayed.length > 0}
			<section>
				<header>
					<h2>recently played</h2>
				</header>
				<ol>
					{#each stats.recentlyPlayed as track (track.id)}
						<li>
							<a href="/{track.channel_slug}">@{track.channel_slug}</a>
							&rarr;
							<a href={`/${track.channel_slug}/${track.id}`}>
								<em>{track.title}</em>
							</a>
						</li>
					{/each}
				</ol>
				<p style="text-align:right"><a href="/history">full play history &rarr;</a></p>
			</section>
		{/if}

		{#if stats.startReasons.length > 0}
			<section>
				<div class="reasons">
					<div>
						<header>
							<h2>play reasons</h2>
						</header>
						{#each stats.startReasons.slice(0, 5) as { reason, count } (reason)}
							<div class="reason-line">
								{reason}
								{count}
							</div>
						{/each}
					</div>
					<div>
						<header>
							<h2>stop reasons</h2>
						</header>
						{#each stats.endReasons.slice(0, 5) as { reason, count } (reason)}
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
				<h2>database</h2>
			</header>
			<p>
				{stats.totalChannelsInDb.toLocaleString()} radios •
				{stats.totalTracksInDb.toLocaleString()} tracks
				<small>&larr; local tracks</small>
			</p>
			<p>
				~{stats.avgTracksPerChannel} tracks per channel
			</p>
			<p>{(stats.totalTracksInDb - stats.tracksWithoutMeta).toLocaleString()} tracks analyzed metadata</p>
		</section>

		{#if stats.channelTimeline.length > 1}
			{@const max = Math.max(...stats.channelTimeline.map((m) => m.count))}
			<section>
				<div class="timeline">
					{#each stats.channelTimeline as month, i (i)}
						<div
							class="bar"
							style="height: {(month.count / max) * 100}%"
							title="{new Date(month.month).toLocaleDateString('en-US', {
								month: 'short',
								year: 'numeric'
							})}: {month.count} channels"
						></div>
					{/each}
				</div>
				<header>
					<h2 style="text-align:right">{stats.totalChannelsInDb.toLocaleString()} Radio4000 channels over time</h2>
				</header>
			</section>
			<br />
		{/if}
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
</style>
