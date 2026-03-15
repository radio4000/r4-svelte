<script>
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {channelsCollection} from '$lib/collections/channels'
	import {followsCollection} from '$lib/collections/follows'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {tracksCollection, fetchRecentTracksForSlugs} from '$lib/collections/tracks'
	import {groupByDay} from '$lib/utils'
	import {loadMoreChannels} from '$lib/collections/channels'
	import {playChannel, togglePlayPause} from '$lib/api'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {appPresence} from '$lib/presence.svelte'
	import {sdk} from '@radio4000/sdk'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const FEATURED_COUNT = 3
	const FEATURED_DAYS = 30

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)

	// Follows — IDs only
	const followsQuery = useLiveQuery((q) => q.from({f: followsCollection}))
	const followedIds = $derived((followsQuery.data ?? []).map((f) => /** @type {{id: string}} */ (f).id))

	// Fetch followed channels into channelsCollection once followedIds are known
	let followedChannelsFetched = $state(false)
	$effect(() => {
		if (!followedIds.length || followedChannelsFetched) return
		followedChannelsFetched = true
		void (async () => {
			await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
			loadMoreChannels({idIn: followedIds.slice(), offset: 0, limit: followedIds.length})
		})()
	})

	// Resolve followed channels from channelsCollection.state, sorted by most recently active
	const followedChannels = $derived.by(() => {
		if (!followedIds.length) return []
		const idSet = new Set(followedIds)
		return /** @type {import('$lib/types').Channel[]} */ (
			[...channelsCollection.state.values()]
				.filter((ch) => ch && idSet.has(ch.id))
				.toSorted((a, b) => {
					const ta = a.latest_track_at ? new Date(a.latest_track_at).getTime() : 0
					const tb = b.latest_track_at ? new Date(b.latest_track_at).getTime() : 0
					return tb - ta
				})
		)
	})

	// Featured channels (not logged in, or no channel)
	let featuredPool = $state(/** @type {import('$lib/types').Channel[]} */ ([]))
	let featuredChannels = $state(/** @type {import('$lib/types').Channel[]} */ ([]))
	let featuredLoaded = $state(false)

	function pickFeatured() {
		if (!featuredPool.length) return
		const featuredSince = new Date(Date.now() - FEATURED_DAYS * 86400000).toISOString()
		const shuffled = featuredPool.toSorted(() => Math.random() - 0.5)
		const picked = shuffled.slice(0, FEATURED_COUNT)
		featuredChannels = picked
		fetchRecentTracksForSlugs(
			picked.map((ch) => ch.slug),
			featuredSince
		)
	}

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
			await loadMoreChannels({
				trackCountGte: 10,
				imageNotNull: true,
				limit: 200,
				offset: 0,
				orderColumn: 'latest_track_at',
				ascending: false
			})
			const featuredSince = new Date(Date.now() - FEATURED_DAYS * 86400000).toISOString()
			featuredPool = [...channelsCollection.state.values()].filter(
				(ch) => (ch.track_count ?? 0) >= 10 && ch.image && ch.latest_track_at && ch.latest_track_at >= featuredSince
			)
			pickFeatured()
		})()
	})

	// Recent tracks from featured channels, sorted by date, top 30, grouped by day
	const featuredTracks = $derived.by(() => {
		if (!featuredChannels.length) return []
		void tracksCollection.state.size // track size so derived re-runs when tracks are upserted
		const featuredSince = new Date(Date.now() - FEATURED_DAYS * 86400000).toISOString()
		const slugSet = new Set(featuredChannels.map((ch) => ch.slug))
		return groupByDay(
			[...tracksCollection.state.values()]
				.filter((t) => t?.slug && slugSet.has(t.slug) && (t.created_at ?? '') >= featuredSince)
				.toSorted((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
				.slice(0, 30)
		)
	})

	const featuredFirst = $derived(featuredChannels[0] ?? null)
	const featuredIsPlaying = $derived(
		!!featuredFirst && Object.values(appState.decks).some((d) => d.playlist_slug === featuredFirst.slug && d.is_playing)
	)

	function toggleFeaturedPlay() {
		if (!featuredFirst) return
		if (featuredIsPlaying) togglePlayPause(appState.active_deck_id)
		else playChannel(appState.active_deck_id, featuredFirst)
	}

	// Live broadcasts — top 10, sorted by most recently active, reactive via realtime
	const activeBroadcasts = $derived.by(() =>
		[...broadcastsCollection.state.values()]
			.filter((b) => b.channel_id && b.channels)
			.toSorted((a, b) => (b.track_played_at ?? '').localeCompare(a.track_played_at ?? ''))
			.slice(0, 10)
	)

	// Stats for not-logged-in users
	let channelCount = $state(0)
	let trackCount = $state(0)
	$effect(() => {
		if (isSignedIn) return
		void sdk.supabase
			.from('channels_with_tracks')
			.select('*', {count: 'exact', head: true})
			.then(({count}) => {
				if (count) channelCount = count
			})
		void sdk.supabase
			.from('channel_tracks')
			.select('*', {count: 'exact', head: true})
			.then(({count}) => {
				if (count) trackCount = count
			})
	})
</script>

<svelte:head>
	<title>{m.home_title({appName})}</title>
</svelte:head>

<div class="homepage">
	{#if isSignedIn}
		<menu class="filtermenu">
			<a href={resolve('/')} class="btn" class:active={page.route.id === '/'}>{m.home_tab_home()}</a>
			<a href={resolve('/feed')} class="btn">{m.home_tab_feed()}</a>
		</menu>
	{/if}

	{#if isSignedIn && userChannel}
		<!-- Logged in with channel -->
		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
				<ol class="grid grid--scroll">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		<section class="section">
			<ol class="list">
				<li><ChannelCard channel={userChannel} /></li>
			</ol>
		</section>

		{#if followedChannels.length > 0}
			<section class="section">
				<ol class="grid">
					{#each followedChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		<p class="explore-link">
			<a href={resolve('/explore')}>{m.home_explore_all()} →</a>
		</p>
	{:else if isSignedIn}
		<!-- Logged in but no channel -->
		<p class="cta">
			<a href={resolve('/create-channel')} class="btn primary">{m.home_create_channel()}</a>
		</p>

		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
				<ol class="grid grid--scroll">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if featuredChannels.length}
			<section class="section">
				<header class="section-header">
					<h2 class="section-title">{m.home_featured()}</h2>
					<menu>
						{#if featuredFirst}
							<button type="button" class="icon-btn" onclick={toggleFeaturedPlay}>
								<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
							</button>
						{/if}
						{#if featuredPool.length > FEATURED_COUNT}
							<button type="button" class="icon-btn" title={m.home_featured_refresh()} onclick={pickFeatured}>
								<Icon icon="shuffle" />
							</button>
						{/if}
					</menu>
				</header>
				<ol class="grid grid--scroll">
					{#each featuredChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if featuredLoaded}
			<p class="explore-link">
				<a href={resolve('/explore')}>{m.home_explore_all()} →</a>
			</p>
		{/if}
	{:else}
		<!-- Not logged in -->
		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
				<ol class="grid grid--scroll">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if featuredChannels.length}
			<section class="section">
				<header class="section-header">
					<h2 class="section-title">{m.home_featured()}</h2>
					<menu>
						{#if featuredFirst}
							<button type="button" class="icon-btn" onclick={toggleFeaturedPlay}>
								<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
							</button>
						{/if}
						{#if featuredPool.length > FEATURED_COUNT}
							<button type="button" class="icon-btn" title={m.home_featured_refresh()} onclick={pickFeatured}>
								<Icon icon="shuffle" />
							</button>
						{/if}
					</menu>
				</header>
				<ol class="grid grid--scroll">
					{#each featuredChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if featuredTracks.length}
			<section class="section">
				<h2 class="section-title">{m.home_featured_tracks()}</h2>
				{#each featuredTracks as group (group.label)}
					<p class="day-header">{group.label}</p>
					<ul class="list">
						{#each group.tracks as track (track.id)}
							<li><TrackCard {track} showSlug={true} /></li>
						{/each}
					</ul>
				{/each}
			</section>
		{/if}

		{#if featuredLoaded}
			{#if channelCount || trackCount || appPresence.count}
				<p class="stats">
					{#if channelCount}<a href={resolve('/explore/channels/all')}
							>{m.home_stats_channels({count: channelCount.toLocaleString()})}</a
						>{/if}
					{#if trackCount}<a href={resolve('/explore/tracks/recent')}
							>{m.home_stats_tracks({count: trackCount.toLocaleString()})}</a
						>{/if}
					{#if appPresence.count}<span>{m.home_stats_listeners({count: appPresence.count})}</span>{/if}
				</p>
			{/if}
			<p class="explore-link">
				<a href={resolve('/explore')}>{m.home_explore_all()} →</a>
			</p>
		{/if}
	{/if}
</div>

<style>
	.homepage {
		padding: 0;

		> * {
			margin-inline: 0.5rem;
		}

		/* grids manage their own margin */
		:global(.grid) {
			margin-inline: 0;
		}
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
		z-index: 1;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;

		.section-title {
			margin-bottom: 0;
		}
	}

	.section-title {
		font-size: var(--font-5);
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: light-dark(var(--gray-11), var(--gray-9));
	}

	.explore-link {
		margin-top: 0.5rem;
		text-align: center;

		a {
			color: var(--accent-9);
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}

	.cta {
		margin-bottom: 1.5rem;
	}

	.empty {
		color: light-dark(var(--gray-10), var(--gray-9));
	}

	.stats {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin: 0.5rem 0;
		font-size: var(--font-3);
		color: light-dark(var(--gray-10), var(--gray-8));

		a {
			color: inherit;
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}
</style>
