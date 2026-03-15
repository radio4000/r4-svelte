<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {channelsCollection} from '$lib/collections/channels'
	import {followsCollection} from '$lib/collections/follows'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {tracksCollection, fetchRecentTracksForSlugs} from '$lib/collections/tracks'
	import {featuredScore} from '$lib/utils'
	import {loadMoreChannels} from '$lib/collections/channels'
	import {playChannel, togglePlayPause} from '$lib/api'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const FEATURED_COUNT = 3
	const FEATURED_DAYS = 30

	/** @param {string} iso YYYY-MM-DD */
	function formatDay(iso) {
		const date = new Date(iso + 'T00:00:00')
		const today = new Date()
		const todayIso = today.toISOString().slice(0, 10)
		const yesterdayIso = new Date(today - 86400000).toISOString().slice(0, 10)
		if (iso === todayIso) return m.day_today()
		if (iso === yesterdayIso) return m.day_yesterday()
		/** @type {Intl.DateTimeFormatOptions} */
		const opts = {month: 'long', day: 'numeric'}
		if (iso.slice(0, 4) !== todayIso.slice(0, 4)) opts.year = 'numeric'
		return date.toLocaleDateString(undefined, opts)
	}

	/**
	 * @param {import('$lib/types').Track[]} tracks
	 * @returns {{label: string, tracks: import('$lib/types').Track[]}[]}
	 */
	function groupByDay(tracks) {
		/** @type {Map<string, import('$lib/types').Track[]>} */
		const map = new Map()
		for (const track of tracks) {
			const day = track.created_at?.slice(0, 10) ?? ''
			if (!map.has(day)) map.set(day, [])
			map.get(day)?.push(track)
		}
		return [...map.entries()].map(([day, items]) => ({label: day ? formatDay(day) : '—', tracks: items}))
	}

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)

	// Tabs: 'home' | 'feed'
	let activeTab = $state('home')

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
		fetchRecentTracksForSlugs(picked.map((ch) => ch.slug), featuredSince)
	}

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
			await loadMoreChannels({trackCountGte: 10, imageNotNull: true, limit: 200, offset: 0, orderColumn: 'latest_track_at', ascending: false})
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

	// Feed: tracks from followed channels in local DB, last 7 days, top 50, grouped by day
	const feedTracks = $derived.by(() => {
		if (!followedChannels.length) return []
		const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
		const slugSet = new Set(followedChannels.map((ch) => ch.slug))
		return groupByDay(
			[...tracksCollection.state.values()]
				.filter((t) => t?.slug && slugSet.has(t.slug) && (t.created_at ?? '') >= sevenDaysAgo)
				.toSorted((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
				.slice(0, 50)
		)
	})

	const featuredFirst = $derived(featuredChannels[0] ?? null)
	const featuredIsPlaying = $derived(
		!!featuredFirst &&
			Object.values(appState.decks).some((d) => d.playlist_slug === featuredFirst.slug && d.is_playing)
	)

	function toggleFeaturedPlay() {
		if (!featuredFirst) return
		featuredIsPlaying ? togglePlayPause(appState.active_deck_id) : playChannel(appState.active_deck_id, featuredFirst)
	}

	// Live broadcasts — top 10, sorted by most recently active, reactive via realtime
	const activeBroadcasts = $derived.by(() =>
		[...broadcastsCollection.state.values()]
			.filter((b) => b.channel_id && b.channels)
			.toSorted((a, b) => (b.track_played_at ?? '').localeCompare(a.track_played_at ?? ''))
			.slice(0, 10)
	)

	// On first feed tab visit: fetch last 7 days of tracks for all followed channels in one query
	let feedEagerLoaded = $state(false)
	$effect(() => {
		if (activeTab !== 'feed' || !followedChannels.length) return
		if (feedEagerLoaded) return
		feedEagerLoaded = true
		const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
		const slugs = followedChannels.map((ch) => ch.slug)
		fetchRecentTracksForSlugs(slugs, sevenDaysAgo)
	})
</script>

<svelte:head>
	<title>{m.home_title({appName})}</title>
</svelte:head>

<div class="homepage">
	{#if isSignedIn && followedIds.length > 0}
		<nav class="tabs">
			<button type="button" class:active={activeTab === 'home'} onclick={() => (activeTab = 'home')}>
				{m.home_tab_home()}
			</button>
			<button type="button" class:active={activeTab === 'feed'} onclick={() => (activeTab = 'feed')}>
				{m.home_tab_feed()}
			</button>
		</nav>
	{/if}

	{#if activeTab === 'home'}
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
				<p class="explore-link">
					<a href={resolve('/explore')}>{m.home_explore_all()} →</a>
				</p>
			{/if}
		{/if}
	{:else if activeTab === 'feed'}
		{#if feedTracks.length}
			{#each feedTracks as group (group.label)}
				<p class="day-header">{group.label}</p>
				<ul class="list">
					{#each group.tracks as track (track.id)}
						<li><TrackCard {track} showSlug={true} /></li>
					{/each}
				</ul>
			{/each}
		{:else}
			<p class="empty">{m.home_feed_loading()}</p>
		{/if}
	{/if}
</div>

<style>
	.homepage {
		padding: 0.5rem;
	}

	nav.tabs {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 0.5rem 0.5rem 0;
		border-bottom: 1px solid var(--gray-4);
		margin: -0.5rem -0.5rem 1rem;
		background: var(--gray-1);
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
		text-align: center;
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

	.day-header {
		font-size: var(--font-4);
		font-weight: 600;
		color: light-dark(var(--gray-11), var(--gray-9));
		margin: 1rem 0 0.25rem;
		&:first-child {
			margin-top: 0;
		}
	}
</style>
