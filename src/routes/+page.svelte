<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import {appName} from '#lib/config.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {channelsCollection, fetchAppStats} from '#lib/collections/channels.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {getFollowedChannels, getChannelConnections} from '#lib/followed-channels.svelte.js'
	import {getFeaturedPool, pickFeatured, dailySeed} from '#lib/collections/featured.js'
	import {getFeaturedSuggestions} from '#lib/featured-suggestions.svelte.js'
	import {tracksCollection, ensureTracksLoaded} from '#lib/collections/tracks.js'
	import {
		getChannelTags,
		extractHashtags,
		seededRandom,
		shuffleArray,
		shuffleSeed
	} from '#lib/utils.js'
	import {loadDeckView, newestFirst, playTrack, toggleChannelPlay} from '#lib/api.js'
	import {isBroadcasting} from '#lib/deck.js'
	import {authStatus} from '#lib/app-state.svelte.js'
	import {appPresence} from '#lib/presence.svelte.js'
	import ChannelCard from '#lib/components/channel-card.svelte'
	import ChannelsView from '#lib/components/channels-view.svelte'
	import ChannelsViewControls from '#lib/components/channels-view-controls.svelte'
	import Dialog from '#lib/components/dialog.svelte'
	import {not, isNull, eq} from '@tanstack/db'
	import Icon from '#lib/components/icon.svelte'
	import PageHeader from '#lib/components/page-header.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const FEATURED_COUNT = 3
	const FEATURED_COUNT_LOGGEDOUT = 20
	const FEATURED_DAYS = 30

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)
	let homeSearch = $state('')

	$effect(() => {
		const q = homeSearch.trim()
		if (!q) return
		goto(`${resolve('search')}?q=${encodeURIComponent(q)}`, {state: {focus: true}})
	})

	const follows = getFollowedChannels()
	const favoriteChannelIds = $derived(new Set(follows.followedIds))
	const followerConn = getChannelConnections('followers', () => userChannel?.id, {hydrate: false})

	// Todo checklist: show when channel exists but onboarding is incomplete
	const showOnboarding = $derived(
		!follows.isLoading &&
			!!userChannel &&
			((userChannel.track_count ?? 0) === 0 ||
				follows.followedIds.length === 0 ||
				!userChannel.image)
	)

	// Featured channels (not logged in, or no channel)
	let featuredPool = $state(/** @type {import('#lib/types.js').Channel[]} */ ([]))
	let featuredLoaded = $state(false)

	const featuredPickCount = $derived(!isSignedIn ? FEATURED_COUNT_LOGGEDOUT : FEATURED_COUNT)

	// Popular tags as listening starting points (logged-out homepage) — cheap:
	// tagsCollection is a pre-aggregated, hour-cached `tag, count` query, not a
	// scan over tracks. Clicking one searches that tag across every channel.
	// Same shape as pickFeatured() for channels: a tight quality window (tags
	// are already sorted by count desc), shuffled for rotation, sliced to the
	// pick count — narrow enough that it stays "most used", not the long tail.
	const DISCOVERY_TAG_COUNT = 20
	const DISCOVERY_TAG_WINDOW = 24
	const tagSuggestions = getFeaturedSuggestions()
	const tagSuggestionsSeed = shuffleSeed()
	const discoveryTags = $derived(
		shuffleArray(
			tagSuggestions.tags.slice(0, DISCOVERY_TAG_WINDOW),
			seededRandom(tagSuggestionsSeed)
		).slice(0, DISCOVERY_TAG_COUNT)
	)

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			try {
				featuredPool = await getFeaturedPool(FEATURED_DAYS)
			} catch (e) {
				console.warn('[homepage] failed to load featured channels', e)
			}
		})()
	})

	// Live broadcasts — reactive via useLiveQuery, sorted by most recently active
	const broadcastsQuery = useLiveQuery(broadcastsCollection)
	const broadcastRows = $derived(
		(broadcastsQuery.data ?? []).toSorted((a, b) =>
			(b.track_played_at ?? '').localeCompare(a.track_played_at ?? '')
		)
	)
	const activeBroadcasts = $derived(broadcastRows.slice(0, 10))
	const favoriteBroadcastRows = $derived.by(() =>
		broadcastRows.filter((broadcast) => favoriteChannelIds.has(broadcast.channel_id))
	)
	const broadcastCount = $derived(broadcastRows.length)
	const favoriteBroadcastCount = $derived(favoriteBroadcastRows.length)
	const userChannelIsBroadcasting = $derived(isBroadcasting(appState.decks, userChannel?.id))

	const userChannelTrackCount = $derived(userChannel?.track_count ?? 0)
	const showTrackWidget = $derived(userChannelTrackCount > 0)

	// Reactive: subscribes to the collection so tags appear once ensureTracksLoaded
	// writes them. A plain tracksCollection.state read wouldn't re-run on that write.
	const channelTracksQuery = useLiveQuery((q) =>
		userChannel?.slug
			? q.from({t: tracksCollection}).where(({t}) => eq(t.slug, userChannel.slug))
			: null
	)

	const userChannelTopTags = $derived.by(() => {
		if (!userChannel?.slug) return []
		const channelTracks = /** @type {import('#lib/types.js').Track[]} */ (
			channelTracksQuery.data ?? []
		)
		const featuredTags = extractHashtags(userChannel.description ?? '').map((t) => t.slice(1))
		const allByCount = getChannelTags(channelTracks)
		const featuredWithCount = featuredTags
			.map((tag) => allByCount.find((t) => t.value === tag) ?? {value: tag, count: 0})
			.slice(0, 13)
		const topExtra = allByCount
			.filter((t) => !featuredTags.includes(t.value))
			.slice(0, 13 - featuredWithCount.length)
		return [...featuredWithCount, ...topExtra]
	})

	const tagsLoading = $derived(showTrackWidget && userChannelTopTags.length === 0)

	$effect(() => {
		const slug = userChannel?.slug
		if (!slug || !showTrackWidget) return
		void ensureTracksLoaded(slug)
	})

	async function playChannelTag(tag) {
		if (!userChannel) return
		const slug = userChannel.slug
		await ensureTracksLoaded(slug)
		const tracks = /** @type {import('#lib/types.js').Track[]} */ (
			newestFirst(
				[...tracksCollection.state.values()].filter(
					(t) =>
						/** @type {any} */ (t).slug === slug && /** @type {any} */ (t.tags ?? []).includes(tag)
				)
			)
		)
		if (!tracks.length) return
		loadDeckView(
			appState.active_deck_id,
			{sources: [{channels: [slug], tags: [tag]}]},
			tracks.map((t) => t.id),
			{slug}
		)
		await playTrack(appState.active_deck_id, tracks[0].id, null, 'play_channel')
	}

	const showFavoritesWidget = $derived(follows.followedChannels.length > 0)
	const showFollowersWidget = $derived(followerConn.ids.length > 0)
	const showFavoriteBroadcastWidget = $derived(favoriteBroadcastCount > 0)
	const showBroadcastCountWidget = $derived(broadcastCount > 0 && !userChannelIsBroadcasting)

	// All synced channels with coordinates — only queried once map mode is actually
	// selected, so switching display modes stays the only thing that loads it.
	const globeChannelsQuery = useLiveQuery((q) =>
		appState.channels_display === 'map'
			? q.from({ch: channelsCollection}).where(({ch}) => not(isNull(ch.latitude)))
			: null
	)
	const globeChannels = $derived(
		(globeChannelsQuery.data ?? []).filter((ch) => (ch.track_count ?? 0) > 10)
	)
	const favoriteMapChannels = $derived(follows.followedChannels.filter((ch) => ch.latitude != null))
	const mapChannels = $derived(
		isSignedIn && favoriteMapChannels.length > 0 ? favoriteMapChannels : globeChannels
	)

	// Non-map modes keep the curated daily pick (favorites take priority when any
	// exist); map mode wants geographic breadth instead, hence mapChannels above.
	let featuredSeed = $state(dailySeed())
	const homeChannels = $derived(
		follows.followedChannels.length > 0
			? follows.followedChannels
			: pickFeatured(featuredPool, {count: featuredPickCount, seed: featuredSeed})
	)
	const homeSectionChannels = $derived(
		appState.channels_display === 'map' ? mapChannels : homeChannels
	)

	// Stats for not-logged-in users
	let channelCount = $state(0)
	let trackCount = $state(0)
	$effect(() => {
		if (isSignedIn) return
		fetchAppStats().then((stats) => {
			channelCount = stats.channels
			trackCount = stats.tracks
		})
	})
</script>

<Seo title={m.home_title({appName})} plain />

<div class="homepage" class:signed-in={isSignedIn}>
	<PageHeader wrap>
		<nav class="home-top-row">
			<SearchInput
				bind:value={homeSearch}
				debounce={300}
				placeholder={m.header_search_placeholder()}
			/>
			<ChannelsViewControls
				bind:display={appState.channels_display}
				bind:order={appState.channels_order}
				bind:direction={appState.channels_order_direction}
			/>
			{#if isSignedIn && authStatus.channelChecked && !userChannel}
				<a href={resolve('/create-channel')} class="btn primary create-channel-action">
					<Icon icon="add" />{m.home_create_channel()}
				</a>
			{/if}
			{#if !isSignedIn}
				<button
					class="btn"
					style="margin-left: auto"
					onclick={() => (appState.show_welcome_hint = true)}
					title={m.welcome_title({appName})}
				>
					<Icon icon="circle-info" />
				</button>
			{/if}
		</nav>
		{#if isSignedIn && userChannel && (userChannelTopTags.length > 0 || tagsLoading)}
			<nav class="home-tags-row">
				<div class="dashboard-grid dashboard-grid--scroll">
					<button
						type="button"
						class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
						onclick={() => toggleChannelPlay(userChannel)}
					>
						<Icon icon="play-fill" size={16} />
						<span class="chip-label">{m.home_play_all()}</span>
					</button>
					{#if tagsLoading}
						<div
							class="dashboard-card dashboard-card--row dashboard-card--pill loading-placeholder"
						>
							<small>…</small>
						</div>
					{/if}
					{#each userChannelTopTags as { value, count } (value)}
						<div class="dashboard-card dashboard-card--row dashboard-card--pill">
							<button
								class="btn ghost tag-pill-action"
								onclick={() => playChannelTag(value)}
								title={m.home_tag_play_title({value})}
							>
								<Icon icon="play-fill" />
							</button>
							<a
								class="dashboard-label--tag"
								href={resolve('/[slug]/tracks', {slug: userChannel.slug}) +
									`?tags=${encodeURIComponent(value)}`}
								>#{value} <span class="chip-count">{count}</span></a
							>
							<a
								class="btn ghost tag-pill-action"
								href={resolve('/search/tracks') + `?q=${encodeURIComponent('#' + value)}`}
								title={m.home_tag_search_title({value})}
							>
								<Icon icon="search" />
							</a>
						</div>
					{/each}
				</div>
			</nav>
		{:else if !isSignedIn && (discoveryTags.length || showBroadcastCountWidget)}
			<nav class="home-tags-row tabs">
				{#if showBroadcastCountWidget}
					<a class="btn chip active top-row-live" href={resolve('channels/broadcasting')}>
						<Icon icon="signal" size={16} />
						<span class="chip-label">
							{m.home_broadcasting()}
							<strong class="chip-count">{broadcastCount.toLocaleString()}</strong>
						</span>
					</a>
				{/if}
				{#each discoveryTags as tag (tag)}
					<a class="btn chip" href={resolve('/search') + `?q=${encodeURIComponent('#' + tag)}`}
						>#{tag}</a
					>
				{/each}
			</nav>
		{/if}
	</PageHeader>

	{#if isSignedIn && userChannel}
		<!-- Logged in with channel -->

		<section class="section dashboard-section">
			{#if showTrackWidget || showFavoritesWidget || showFollowersWidget || showFavoriteBroadcastWidget}
				<div class="dashboard-group">
					<div class="dashboard-grid dashboard-grid--scroll">
						{#if showTrackWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/[slug]/tracks', {slug: userChannel.slug})}
							>
								<Icon icon="unordered-list" size={16} />
								<span class="chip-label">
									{m.home_dashboard_tracks()}
									<strong class="chip-count">{userChannelTrackCount.toLocaleString()}</strong>
								</span>
							</a>
						{/if}
						{#if showFavoritesWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/[slug]/following', {slug: userChannel.slug})}
							>
								<Icon icon="favorite-fill" size={16} />
								<span class="chip-label">
									{m.home_dashboard_favorites()}
									<strong class="chip-count"
										>{follows.followedChannels.length.toLocaleString()}</strong
									>
								</span>
							</a>
						{/if}
						{#if showFollowersWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/[slug]/followers', {slug: userChannel.slug})}
							>
								<Icon icon="users" size={16} />
								<span class="chip-label">
									{m.nav_followers()}
									<strong class="chip-count">{followerConn.ids.length.toLocaleString()}</strong>
								</span>
							</a>
						{/if}
						{#if showFavoriteBroadcastWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('channels/broadcasting')}
							>
								<Icon icon="signal" size={16} />
								<span class="chip-label">
									{m.home_dashboard_favorites_broadcasting()}
									<strong class="chip-count">{favoriteBroadcastCount.toLocaleString()}</strong>
								</span>
							</a>
						{/if}
					</div>
				</div>
			{/if}

			{#if showOnboarding}
				{#if appState.show_onboarding_hint}
					<section class="section onboarding-section dismissible">
						<button
							class="dismiss-btn"
							onclick={() => (appState.show_onboarding_hint = false)}
							aria-label={m.home_onboarding_close()}
						>
							<Icon icon="close" />
						</button>
						<ol class="todo-list">
							<li>
								<input type="checkbox" disabled checked={(userChannel.track_count ?? 0) > 0} />
								<a href={resolve('/[slug]/tracks', {slug: userChannel.slug})}
									>{m.home_onboarding_add_track()}</a
								>
							</li>
							<li>
								<input type="checkbox" disabled checked={follows.followedIds.length > 0} />
								<a href={resolve('channels/featured')}>{m.home_onboarding_follow_radio()}</a>
							</li>
							<li>
								<input type="checkbox" disabled checked={!!userChannel.image} />
								<a href={resolve('/[slug]/edit', {slug: userChannel.slug})}
									>{m.home_onboarding_add_image()}</a
								>
							</li>
						</ol>
					</section>
				{:else}
					<div class="onboarding-toggle-row">
						<button
							class="btn onboarding-toggle"
							onclick={() => (appState.show_onboarding_hint = true)}
							title={m.home_onboarding_show()}
						>
							<Icon icon="circle-info" />
						</button>
					</div>
				{/if}
			{/if}
		</section>

		<section class="section section--channels">
			<ChannelsView
				channels={homeSectionChannels}
				display={appState.channels_display}
				order={appState.channels_order}
				direction={appState.channels_order_direction}
				showToolbar={false}
			/>
		</section>
	{:else if isSignedIn && authStatus.channelChecked}
		<!-- Logged in but no channel -->
		<section class="section dashboard-section">
			<div class="dashboard-grid">
				<a
					class="dashboard-card dashboard-card--link dashboard-card--row"
					href={resolve('/create-channel')}
				>
					<Icon icon="add" size={16} />
					<span>{m.home_create_channel()}</span>
				</a>
			</div>
		</section>
		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">
					<a class="btn chip" href={resolve('channels/broadcasting')}>{m.home_broadcasting()}</a>
				</h2>
				<ol class="list">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		<section class="section section--channels">
			<ChannelsView
				channels={homeSectionChannels}
				display={appState.channels_display}
				order={appState.channels_order}
				direction={appState.channels_order_direction}
				showToolbar={false}
			/>
		</section>
	{:else}
		<!-- Not logged in -->

		<Dialog bind:showModal={appState.show_welcome_hint}>
			{#snippet header()}
				<h2>{m.welcome_title({appName})}</h2>
			{/snippet}
			<p class="tagline">{m.welcome_tagline_channel()}</p>
			<p class="tagline">{m.welcome_tagline_metadata()}</p>
			<ul class="feature-list">
				<li>{m.welcome_feature_archive()}</li>
				<li>{m.welcome_feature_decks()}</li>
				<li>{m.welcome_feature_follow()}</li>
				<li>{m.welcome_feature_open()}</li>
			</ul>
			<menu class="welcome-menu">
				<a
					href={resolve('/auth/create-account') + '?redirect=' + resolve('/create-channel')}
					class="btn primary">{m.header_start_your_radio()}</a
				>
				<a href={resolve('/auth/login')} class="btn">{m.nav_sign_in()}</a>
				<a href={resolve('/about')} class="btn ghost">{m.nav_about()}</a>
			</menu>
		</Dialog>

		<section class="section section--channels">
			<ChannelsView
				channels={homeSectionChannels}
				display={appState.channels_display}
				order={appState.channels_order}
				direction={appState.channels_order_direction}
				showToolbar={false}
			/>
		</section>

		{#if featuredLoaded && (channelCount || trackCount || appPresence.count)}
			<footer class="stats footer-stats">
				{#if channelCount}<a href={resolve('channels/all')}
						>{m.home_stats_channels({count: channelCount.toLocaleString()})}</a
					>{/if}
				{#if trackCount}<a href={resolve('tracks/recent')}
						>{m.home_stats_tracks({count: trackCount.toLocaleString()})}</a
					>{/if}
				{#if appPresence.count}<span>{m.home_stats_listeners({count: appPresence.count})}</span
					>{/if}
			</footer>
		{/if}
	{/if}
</div>

<style>
	.homepage {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;

		/* grids manage their own horizontal spacing */
		:global(.grid) {
			margin-inline: 0rem;
		}
	}

	.homepage.signed-in {
		background: var(--color-interface);
	}

	.homepage:not(.signed-in) {
		padding: 0;
	}

	.create-channel-action {
		margin-left: auto;
	}

	.section {
		margin-bottom: 0;
	}

	.homepage > :global(.section) {
		position: relative;
		z-index: 6;
		background: var(--color-interface);
	}

	.homepage.signed-in > :global(.section):not(.dashboard-section) {
		position: relative;
		z-index: 6;
		background: var(--color-interface);
	}

	.section--channels {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 40dvh;
		margin-bottom: 0;
		padding: var(--space-2) 0.5rem 0.5rem;
		gap: 0.5rem;

		/* ChannelsView's own root is `.fill-height` (flex:1; height:100%) — this
		   section is what gives that height something real to fill. */
		& > :global(.layout) {
			flex: 1;
			min-height: 0;
		}
	}

	.home-top-row,
	.home-tags-row {
		width: 100%;
	}

	.home-top-row {
		gap: 0.5rem;
		align-items: center;
	}

	.dashboard-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: var(--space-2);

		:global(.list) {
			margin: 0;
		}
	}

	.dashboard-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		border-radius: var(--border-radius);
		background: var(--color-interface);
	}

	.dashboard-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.dashboard-grid--scroll {
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;
		scroll-snap-type: x proximity;

		& > .dashboard-card {
			flex-shrink: 0;
			scroll-snap-align: start;
		}
	}

	.dashboard-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: 0.5rem;
		border-radius: var(--border-radius);
		background: light-dark(var(--gray-1), var(--gray-2));
		min-width: 0;
		min-height: 2rem;
	}

	.dashboard-card--row {
		flex-direction: row;
		align-items: center;
		overflow: hidden;
	}

	/* Same chrome as .btn.chip elsewhere (channel tabs, filters) — a pill is a pill. */
	.dashboard-card--pill {
		padding: 0 var(--space-2);
		border-radius: calc(var(--border-radius) * 999);
		gap: var(--space-1);
		min-height: 2.25rem;
		background: var(--button-bg);
		border: 1px solid var(--color-control-border);

		&:hover {
			background: var(--gray-4);
			border-color: var(--color-control-border-hover);
		}
	}

	.dashboard-card--link {
		text-decoration: none;
		transition: background var(--duration-1);

		&:hover,
		&:focus-visible {
			background: var(--gray-4);
			outline: none;
		}
	}

	.dashboard-card--row > a.dashboard-label--tag {
		flex: 0 0 auto;
		max-width: 16ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-label--tag {
		text-decoration: none;
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		min-width: 0;
		flex-shrink: 1;
		&:hover {
			text-decoration: underline;
		}
	}

	.dashboard-card:has(.dashboard-label--tag:hover) {
		background: var(--gray-3);
	}

	.tag-pill-action {
		flex: 0 0 auto;
		min-width: 1.5rem;
		min-height: 1.5rem;
		padding: 0;
	}

	.section-title {
		font-size: var(--font-7);
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: light-dark(var(--gray-11), var(--gray-9));
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		margin: 0.5rem auto;
		max-width: 56rem;
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

	.homepage:not(.signed-in) .stats {
		max-width: none;
		margin-inline: 0;
		padding-inline: 0.5rem;
	}

	.dismissible {
		position: relative;
	}

	.dismiss-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
	}

	.tagline {
		font-size: var(--font-6);
	}

	.feature-list {
		margin-block: 1rem;
		font-size: var(--font-5);
		padding-left: 1.25rem;

		li {
			margin-block: var(--space-1);
		}
	}

	.welcome-menu {
		margin-block: 1rem 0;
		gap: 0.5rem;
		justify-content: center;
	}

	.onboarding-toggle-row {
		display: flex;
		justify-content: flex-end;
	}

	.onboarding-section {
		max-width: 56rem;
		margin-inline: auto;
		padding: 1.25rem;
		border-radius: var(--border-radius);
		background: light-dark(var(--gray-2), var(--gray-2));
	}

	.onboarding-section {
		.todo-list {
			list-style: none;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			font-size: var(--font-5);

			li {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				color: light-dark(var(--gray-11), var(--gray-9));

				&:has(input:checked) {
					color: light-dark(var(--gray-8), var(--gray-7));
					text-decoration: line-through;

					a {
						color: inherit;
					}
				}
			}
		}
	}
</style>
