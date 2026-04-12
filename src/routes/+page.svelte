<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {channelsCollection} from '$lib/collections/channels'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {featuredScore} from '$lib/utils'
	import {getFollowedChannels} from '$lib/followed-channels.svelte'
	import {getFeaturedPool} from '$lib/collections/featured'
	import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'
	import {trackMetaCollection, trackMetaKey} from '$lib/collections/track-meta'
	import {getChannelTags, extractHashtags} from '$lib/utils'
	import {playChannel, togglePlayPause, loadDeckView, playTrack, sortByNewest} from '$lib/api'
	import {isBroadcasting} from '$lib/deck'
	import {authStatus} from '$lib/app-state.svelte'
	import {appPresence, watchPresence, unwatchPresence} from '$lib/presence.svelte'
	import {sdk} from '@radio4000/sdk'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import MyChannelControls from '$lib/components/my-channel-controls.svelte'

	import CoverFlip from '$lib/components/cover-flip.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import MapChannels from '$lib/components/map-channels.svelte'
	import {not, isNull} from '@tanstack/db'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const FEATURED_COUNT = 3
	const FEATURED_COUNT_LOGGEDOUT = 6
	const FEATURED_DAYS = 30

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)

	const follows = getFollowedChannels()
	const favoriteChannelIds = $derived(new Set(follows.followedIds))

	// Todo checklist: show when channel exists but onboarding is incomplete
	const showOnboarding = $derived(
		!follows.isLoading &&
			!!userChannel &&
			((userChannel.track_count ?? 0) === 0 ||
				follows.followedIds.length === 0 ||
				!userChannel.image)
	)

	// Featured channels (not logged in, or no channel)
	let featuredPool = $state(/** @type {import('$lib/types').Channel[]} */ ([]))
	let featuredChannels = $state(/** @type {import('$lib/types').Channel[]} */ ([]))
	let featuredLoaded = $state(false)

	const featuredPickCount = $derived(!isSignedIn ? FEATURED_COUNT_LOGGEDOUT : FEATURED_COUNT)

	// Shuffle button: random pick from the quality pool for variety
	let shuffling = $state(false)
	async function pickFeatured() {
		if (!featuredPool.length || shuffling) return
		shuffling = true
		try {
			const picked = featuredPool.toSorted(() => Math.random() - 0.5).slice(0, featuredPickCount)
			featuredChannels = picked
		} finally {
			shuffling = false
		}
	}

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			try {
				const pool = await getFeaturedPool(FEATURED_DAYS)
				featuredPool = pool
				// Initial pick: by score, consistent with explore pages
				const picked = pool
					.toSorted((a, b) => featuredScore(b) - featuredScore(a))
					.slice(0, featuredPickCount)
				featuredChannels = picked
			} catch (e) {
				console.warn('[homepage] failed to load featured channels', e)
			}
		})()
	})

	const featuredFirst = $derived(featuredChannels[0] ?? null)
	const featuredIsPlaying = $derived(
		!!featuredFirst &&
			Object.values(appState.decks).some(
				(d) => d.playlist_slug === featuredFirst.slug && d.is_playing
			)
	)

	function toggleFeaturedPlay() {
		if (!featuredFirst) return
		if (featuredIsPlaying) togglePlayPause(appState.active_deck_id)
		else playChannel(appState.active_deck_id, featuredFirst)
	}

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
	const favoriteBroadcasts = $derived.by(() => favoriteBroadcastRows.slice(0, 10))
	const broadcastCount = $derived(broadcastRows.length)
	const favoriteBroadcastCount = $derived(favoriteBroadcastRows.length)
	const userChannelIsBroadcasting = $derived(isBroadcasting(appState.decks, userChannel?.id))

	// User channel play state

	$effect(() => {
		const slug = userChannel?.slug
		if (!slug) return
		watchPresence(slug)
		return () => unwatchPresence(slug)
	})

	const userChannelTrackCount = $derived(userChannel?.track_count ?? 0)
	const showTrackWidget = $derived(userChannelTrackCount > 0)

	const userChannelTopTags = $derived.by(() => {
		if (!userChannel?.slug) return []
		const channelTracks = /** @type {import('$lib/types').Track[]} */ (
			[...tracksCollection.state.values()].filter(
				(t) => /** @type {any} */ (t).slug === userChannel.slug
			)
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
		const tracks = /** @type {import('$lib/types').Track[]} */ (
			[...tracksCollection.state.values()]
				.filter(
					(t) =>
						/** @type {any} */ (t).slug === slug && /** @type {any} */ (t.tags ?? []).includes(tag)
				)
				.sort(sortByNewest)
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
	const showFavoriteBroadcastWidget = $derived(favoriteBroadcastCount > 0)
	const showBroadcastCountWidget = $derived(broadcastCount > 0 && !userChannelIsBroadcasting)
	const activeDecks = $derived.by(() => {
		void trackMetaCollection.state.size
		return Object.values(appState.decks)
			.filter((d) => d.playlist_track)
			.sort((a, b) => a.id - b.id)
			.map((deck) => {
				const currentId = deck.playlist_track
				const tracks = deck.playlist_tracks
				const currentIdx = currentId ? tracks.indexOf(currentId) : -1
				const nextId = currentIdx >= 0 ? tracks[currentIdx + 1] : tracks[0]
				const getTrack = (id) => (id ? tracksCollection.state.get(id) : undefined)
				const current = getTrack(currentId)
				const meta = current?.media_id
					? trackMetaCollection.state.get(trackMetaKey(current.provider, current.media_id))
					: undefined
				return {deck, current, next: getTrack(nextId), meta}
			})
	})
	const showBroadcastStatusWidget = $derived(activeDecks.length > 0)

	// Globe channels — all synced channels with coordinates
	const globeChannelsQuery = useLiveQuery((q) =>
		q.from({ch: channelsCollection}).where(({ch}) => not(isNull(ch.latitude)))
	)
	const globeChannels = $derived(globeChannelsQuery.data ?? [])
	const favoriteMapChannels = $derived(follows.followedChannels.filter((ch) => ch.latitude != null))
	const mapChannels = $derived(
		isSignedIn && favoriteMapChannels.length > 0 ? favoriteMapChannels : globeChannels
	)
	const mapOverlayHref = $derived(
		isSignedIn && favoriteMapChannels.length > 0
			? resolve('/channels/favorites') + '?display=map'
			: resolve('/channels/all') + '?display=map'
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
	<menu class="filtermenu">
		<ExploreSectionMenu />
		{#if isSignedIn && authStatus.channelChecked && !userChannel}
			<a href={resolve('/create-channel')} class="btn primary create-channel-action">
				<Icon icon="add" />{m.home_create_channel()}
			</a>
		{/if}
		{#if !isSignedIn}
			{#if showBroadcastCountWidget}
				<a class="btn broadcast-live-link" href={resolve('/channels/broadcasting')}>
					<Icon icon="signal" />
					<span>{broadcastCount.toLocaleString()}</span>
				</a>
			{/if}
			{#if !appState.show_welcome_hint}
				<button
					class="btn"
					style="margin-left: auto"
					onclick={() => (appState.show_welcome_hint = true)}
					title={m.welcome_title({appName})}
				>
					<Icon icon="circle-info" />
				</button>
			{/if}
		{/if}
		{#if userChannel}
			<MyChannelControls channel={userChannel} />
		{/if}
	</menu>

	{#if isSignedIn && userChannel}
		<!-- Logged in with channel -->

		<section class="section dashboard-section">
			{#if showBroadcastStatusWidget}
				<div class="dashboard-group">
					<div class="dashboard-grid">
						{#if showBroadcastStatusWidget}
							{#each activeDecks as { deck, current, next, meta } (deck.id)}
								{@const discogsResource = /** @type {any} */ (meta?.discogs_data ?? null)}
								{@const mbRecording = /** @type {any} */ (
									meta?.musicbrainz_data &&
									typeof meta.musicbrainz_data === 'object' &&
									'recording' in meta.musicbrainz_data
										? /** @type {any} */ (meta.musicbrainz_data).recording
										: null
								)}
								{@const hasMeta = Boolean(discogsResource || mbRecording)}
								<div
									class="dashboard-card dashboard-card--row broadcast-deck-card"
									class:has-meta={hasMeta}
								>
									<Icon icon={deck.is_playing ? 'speakers-fill' : 'speakers'} size={14} />
									{#if deck.broadcasting_channel_id}
										<Icon icon="signal" size={14} />
									{/if}
									<span class="broadcast-track-title">{current?.title ?? '—'}</span>
									{#if next}
										<Icon icon="next-fill" size={12} />
										<span class="broadcast-track-title broadcast-track-title--next"
											>{next.title}</span
										>
									{/if}
									{#if discogsResource || mbRecording}
										<div class="broadcast-metadata">
											{#if discogsResource}
												{@const artist =
													discogsResource.artists_sort ||
													discogsResource.artists?.map((a) => a.name).join(', ') ||
													''}
												{@const year =
													discogsResource.released_formatted ||
													(discogsResource.year ? String(discogsResource.year) : '')}
												<div class="broadcast-meta-item">
													{#if discogsResource.thumb}
														<img
															class="meta-thumb"
															src={discogsResource.thumb}
															alt=""
															loading="lazy"
														/>
													{/if}
													<span class="meta-text">
														{#if artist}<strong>{artist}</strong> —{/if}
														{discogsResource.title}{#if year}<small class="meta-year">{year}</small
															>{/if}
													</span>
													{#if discogsResource.uri}
														<a
															class="meta-badge"
															href={discogsResource.uri}
															target="_blank"
															rel="noopener noreferrer"
														>
															<Icon icon="tag" size={10} />Discogs
														</a>
													{/if}
												</div>
											{/if}
											{#if mbRecording}
												{@const mbArtist = mbRecording['artist-credit']?.[0]?.artist?.name}
												{@const mbDate = mbRecording['first-release-date']}
												<div class="broadcast-meta-item">
													<span class="meta-text">
														{#if mbArtist}<strong>{mbArtist}</strong> —{/if}
														{mbRecording.title}{#if mbDate}<small class="meta-year">{mbDate}</small
															>{/if}
													</span>
													<a
														class="meta-badge"
														href="https://musicbrainz.org/recording/{mbRecording.id}"
														target="_blank"
														rel="noopener noreferrer"
													>
														<Icon icon="circle-info" size={10} />MusicBrainz
													</a>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			{#if showTrackWidget || showFavoritesWidget || showFavoriteBroadcastWidget || showBroadcastCountWidget}
				<div class="dashboard-group">
					<div class="dashboard-grid">
						{#if showTrackWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/[slug]/tracks', {slug: userChannel.slug})}
							>
								<Icon icon="unordered-list" size={16} />
								<span>{m.home_dashboard_tracks()}</span>
								<strong class="dashboard-value broadcast-count"
									>{userChannelTrackCount.toLocaleString()}</strong
								>
							</a>
						{/if}
						{#if showFavoritesWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/channels/favorites')}
							>
								<Icon icon="favorite-fill" size={16} />
								<span>{m.home_dashboard_favorites()}</span>
								<strong class="dashboard-value broadcast-count"
									>{follows.followedChannels.length.toLocaleString()}</strong
								>
							</a>
						{/if}
						{#if showFavoriteBroadcastWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/channels/broadcasting')}
							>
								<Icon icon="signal" size={16} />
								<span>{m.home_dashboard_favorites_broadcasting()}</span>
								<strong class="dashboard-value broadcast-count"
									>{favoriteBroadcastCount.toLocaleString()}</strong
								>
							</a>
						{/if}
						{#if showBroadcastCountWidget}
							<a
								class="dashboard-card dashboard-card--link dashboard-card--row dashboard-card--pill"
								href={resolve('/channels/broadcasting')}
							>
								<Icon icon="signal" size={16} />
								<span>{m.home_dashboard_live_radios()}</span>
								<strong class="dashboard-value broadcast-count"
									>{broadcastCount.toLocaleString()}</strong
								>
							</a>
						{/if}
					</div>
				</div>
			{/if}

			{#if userChannelTopTags.length > 0 || tagsLoading || showOnboarding}
				<div class="dashboard-group">
					<div class="dashboard-grid">
						{#if tagsLoading}
							<div
								class="dashboard-card dashboard-card--row dashboard-card--tag dashboard-card--pill loading-placeholder"
							>
								<small>…</small>
							</div>
						{/if}
						{#each userChannelTopTags as { value, count } (value)}
							<div
								class="dashboard-card dashboard-card--row dashboard-card--tag dashboard-card--pill"
							>
								<button
									class="btn ghost tag-pill-action"
									onclick={() => playChannelTag(value)}
									title="Play #{value}"
								>
									<Icon icon="play-fill" />
								</button>
								<a
									class="dashboard-label--tag"
									href={resolve('/[slug]/tracks', {slug: userChannel.slug}) +
										`?tags=${encodeURIComponent(value)}`}
									>#{value} <small class="tag-count">{count}</small></a
								>
								<a
									class="btn ghost tag-pill-action"
									href={resolve('/search/tracks') + `?q=${encodeURIComponent('#' + value)}`}
									title="Search #{value} globally"
								>
									<Icon icon="search" />
								</a>
							</div>
						{/each}
						{#if showOnboarding}
							{#if appState.show_onboarding_hint}
								<div class="dashboard-card onboarding dismissible">
									<button
										class="dismiss-btn"
										onclick={() => (appState.show_onboarding_hint = false)}
										aria-label="Close"
									>
										<Icon icon="close" />
									</button>
									<ol class="todo-list">
										<li>
											<input
												type="checkbox"
												disabled
												checked={(userChannel.track_count ?? 0) > 0}
											/>
											<a href={resolve('/[slug]/tracks', {slug: userChannel.slug})}
												>{m.home_onboarding_add_track()}</a
											>
										</li>
										<li>
											<input
												type="checkbox"
												disabled
												checked={follows.followedChannels.length > 0}
											/>
											<a href={resolve('/channels/featured')}>{m.home_onboarding_follow_radio()}</a>
										</li>
										<li>
											<input type="checkbox" disabled checked={!!userChannel.image} />
											<a href={resolve('/[slug]/edit', {slug: userChannel.slug})}
												>{m.home_onboarding_add_image()}</a
											>
										</li>
									</ol>
								</div>
							{/if}
						{/if}
					</div>
					{#if showOnboarding && !appState.show_onboarding_hint}
						<div class="onboarding-toggle-row">
							<button
								class="btn onboarding-toggle"
								onclick={() => (appState.show_onboarding_hint = true)}
								title="Show getting started"
							>
								<Icon icon="circle-info" />
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		{#if favoriteBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_favorites_broadcasting()}</h2>
				<ol class="list">
					{#each favoriteBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}
		<section class="section section--globe">
			<div class="globe">
				<MapChannels
					channels={mapChannels}
					globeMode={true}
					zoom={1}
					syncUrl={false}
					showControls={false}
					tileStyle="topo"
				/>
				<a href={mapOverlayHref} class="btn map-overlay-btn" aria-label={m.nav_map()}>
					<Icon icon="fullscreen" size={14} />
				</a>
			</div>
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
					<a href={resolve('/channels/broadcasting')}>{m.home_broadcasting()}</a>
				</h2>
				<ol class="list">
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
							<button type="button" onclick={toggleFeaturedPlay}>
								<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
							</button>
						{/if}
						{#if featuredPool.length > featuredPickCount}
							<button
								type="button"
								title={m.home_featured_refresh()}
								onclick={pickFeatured}
								disabled={shuffling}
							>
								<Icon icon="switch-alt" />
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
	{:else}
		<!-- Not logged in -->
		{#if appState.show_welcome_hint}
			<section class="section welcome-section dismissible">
				<button
					class="dismiss-btn"
					onclick={() => (appState.show_welcome_hint = false)}
					aria-label="Close"
				>
					<Icon icon="close" />
				</button>
				<h1>{m.welcome_title({appName})}</h1>
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
			</section>
		{/if}

		<section class="section section--globe section--globe--loggedout">
			<div class="globe">
				<MapChannels
					channels={globeChannels}
					globeMode={true}
					zoom={1.5}
					syncUrl={false}
					showControls={false}
					tileStyle="topo"
				/>
				<a
					href={resolve('/channels/all') + '?display=map'}
					class="btn map-overlay-btn"
					aria-label={m.nav_map()}
				>
					<Icon icon="fullscreen" size={14} />
				</a>
			</div>
		</section>

		<div class="loggedout-over-globe">
			{#if showBroadcastCountWidget}
				<section class="section">
					<h2 class="section-title">
						<a href={resolve('/channels/broadcasting')}>{m.home_broadcasting()}</a>
					</h2>
					<ol class="list">
						{#each activeBroadcasts as broadcast (broadcast.channel_id)}
							<li><ChannelCard channel={broadcast.channels} /></li>
						{/each}
					</ol>
				</section>
			{/if}

			<div class="loggedout-grid">
				{#if featuredChannels.length}
					<section class="section section--featured-col">
						<header class="section-header">
							<h2 class="section-title">
								<a href={resolve('/channels/featured')}>{m.home_featured()}</a>
							</h2>
							<menu>
								{#if featuredFirst}
									<button type="button" onclick={toggleFeaturedPlay}>
										<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
									</button>
								{/if}
								{#if featuredPool.length > featuredPickCount}
									<button
										type="button"
										title={m.home_featured_refresh()}
										onclick={pickFeatured}
										disabled={shuffling}
									>
										<Icon icon="switch-alt" />
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
			</div>

			{#if featuredChannels.length}
				<CoverFlip
					items={featuredPool.length > featuredChannels.length ? featuredPool : featuredChannels}
					orientation="horizontal"
					class="featured-flip"
				>
					{#snippet item({item: channel, active})}
						<div class="flip-card" class:active>
							<ChannelCard {channel} />
						</div>
					{/snippet}
					{#snippet active({item: channel})}
						<p class="flip-label">
							<a href={resolve(`/${channel.slug}`)}>{channel.name}</a>
							{#if channel.description}
								<span class="flip-desc"
									>— {channel.description.length > 140
										? channel.description.slice(0, 140) + '…'
										: channel.description}</span
								>
							{/if}
						</p>
					{/snippet}
				</CoverFlip>
			{/if}

			{#if featuredLoaded && (channelCount || trackCount || appPresence.count)}
				<footer class="stats footer-stats">
					{#if channelCount}<a href={resolve('/channels/all')}
							>{m.home_stats_channels({count: channelCount.toLocaleString()})}</a
						>{/if}
					{#if trackCount}<a href={resolve('/tracks/recent')}
							>{m.home_stats_tracks({count: trackCount.toLocaleString()})}</a
						>{/if}
					{#if appPresence.count}<span>{m.home_stats_listeners({count: appPresence.count})}</span
						>{/if}
				</footer>
			{/if}
		</div>
	{/if}
</div>

<style>
	.homepage {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;

		/* grids manage their own horizontal spacing */
		:global(.grid) {
			margin-inline: 0rem;
		}
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		align-items: center;
		margin: 0 0 1rem;
		z-index: 1;
	}

	.filtermenu:first-child {
		z-index: 2;
	}

	.create-channel-action {
		margin-left: auto;
	}

	.broadcast-live-link {
		color: var(--accent-9);
		border-color: var(--accent-6);
		background: var(--accent-2);

		&:hover,
		&:focus-visible {
			border-color: var(--accent-7);
			background: var(--accent-3);
		}
	}

	:global(.my-channel) {
		margin-left: auto;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section--globe {
		display: flex;
		flex-direction: column;
		min-height: 0;
		margin-bottom: 0;
		position: sticky;
		top: 0;
		z-index: 0;
	}

	.section--globe:not(.section--globe--loggedout) {
		flex: 1;
	}

	.loggedout-over-globe {
		position: relative;
		z-index: 1;
		background: var(--color-interface);
	}

	.section--featured-col {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.section--globe--loggedout .globe {
		max-height: 55dvh;
	}

	.loggedout-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
		flex: 1;
		min-height: 0;
		overflow: hidden;

		& > section {
			min-width: 0;
			overflow: hidden;
		}
	}

	.dashboard-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		:global(.list) {
			margin: 0;
		}
	}

	.dashboard-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.dashboard-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.dashboard-card {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.5rem;
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		background: light-dark(var(--gray-1), var(--gray-2));
		min-width: 0;
	}

	.dashboard-card--row {
		flex-direction: row;
		align-items: center;
		overflow: hidden;
	}

	.dashboard-card--pill {
		padding: 0.22rem 0.38rem;
		border-radius: 999px;
		gap: 0.28rem;
		background: var(--color-interface-elevated);
	}

	.dashboard-card--pill :global(svg) {
		width: 0.92rem;
		height: 0.92rem;
	}

	.dashboard-card--row > span:not(.channel-widget-avatar):not(.tag-count):not(.audience-counts) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		font-size: var(--font-2);
	}

	.dashboard-card--row > a.dashboard-label--tag {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1 1 auto;
	}

	.dashboard-label--tag {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
		flex-shrink: 1;
		&:hover {
			text-decoration: underline;
		}
	}

	.tag-count {
		font-size: var(--font-2);
		color: light-dark(var(--gray-9), var(--gray-8));
		margin: 0;
		flex-shrink: 0;
	}

	.tag-actions {
		display: flex;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.tag-pill-action {
		flex: 0 0 auto;
		padding-inline: 0.28rem;
	}

	.dashboard-card--link {
		color: inherit;
		text-align: left;
		text-decoration: none;
		transition:
			background 0.1s,
			border-color 0.1s;

		&:hover,
		&:focus-visible {
			background: var(--gray-2);
			border-color: var(--accent-7);
			outline: none;
		}
	}

	.dashboard-value {
		font-size: var(--font-7);
		font-weight: 600;
		line-height: 1.1;
		color: light-dark(var(--gray-12), var(--gray-11));
	}

	.broadcast-count {
		margin-left: auto;
		font-size: var(--font-2);
		font-weight: 700;
	}

	.broadcast-deck-card {
		border-color: var(--accent-7);
		background: var(--accent-2);
		font-size: var(--font-2);
		overflow: hidden;

		&.has-meta {
			flex-wrap: wrap;
		}
	}

	.broadcast-track-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.broadcast-track-title--next {
		opacity: 0.5;
		flex: 0 1 auto;
	}

	.broadcast-metadata {
		flex: 1 0 100%;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding-top: 0.3rem;
		border-top: 1px solid var(--accent-4);
		margin-top: 0.1rem;
	}

	.broadcast-meta-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.meta-thumb {
		width: 28px;
		height: 28px;
		object-fit: cover;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.meta-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-2);
	}

	.meta-year {
		margin-left: 0.3rem;
		color: light-dark(var(--gray-9), var(--gray-8));
	}

	.meta-badge {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		font-size: var(--font-1);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: light-dark(var(--gray-8), var(--gray-7));
		text-decoration: none;
		padding: 0.1rem 0.3rem;
		border: 1px solid var(--accent-5);
		border-radius: 3px;

		&:hover {
			color: light-dark(var(--gray-11), var(--gray-10));
			border-color: var(--accent-7);
		}
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

	.globe {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 50dvh;
		margin-top: -0.75rem;
		background: transparent;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		:global(.map) {
			flex: 1;
			min-height: 0;
		}
		:global(article .description) {
			display: none;
		}
	}

	.map-overlay-btn {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		z-index: 10;
		opacity: 0.7;
		&:hover {
			opacity: 1;
		}
	}

	.footer-stats {
		padding-top: 1rem;
		border-top: 1px solid var(--gray-4);
	}

	.dismissible {
		position: relative;
	}

	.dismiss-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
	}

	.welcome-section {
		max-width: 56rem;
		margin-inline: auto;
		padding: 1.5rem;
		border-radius: 0.75rem;
		background: light-dark(var(--gray-2), var(--gray-2));
		border: 1px solid light-dark(var(--gray-4), var(--gray-4));

		h1 {
			font-size: var(--font-8);
			margin-bottom: 1rem;
		}

		.tagline {
			font-size: var(--font-6);
		}

		.feature-list {
			margin-block: 1rem;
			font-size: var(--font-5);
			padding-left: 1.25rem;

			li {
				margin-block: 0.3rem;
			}
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

	.onboarding {
		grid-column: 1 / -1;

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

	:global(.featured-flip) {
		gap: 0.25rem;
	}

	.flip-card {
		width: 250px;

		:global(.body) {
			display: none;
		}
	}

	.flip-desc {
		color: var(--gray-10);
	}

	.flip-label {
		text-align: center;
		font-size: var(--font-4);
		padding: 0.5rem;
		/* avoid jumping descriptions */
		min-height: 6rem;
	}
</style>
