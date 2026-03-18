<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {featuredScore} from '$lib/utils'
	import {getFollowedChannels} from '$lib/followed-channels.svelte'
	import {getFeaturedPool} from '$lib/collections/featured'
	import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'
	import {toAutoTracks} from '$lib/player/auto-radio'
	import {playChannel, togglePlayPause, resyncAutoRadio, joinAutoRadio} from '$lib/api'
	import {authStatus} from '$lib/app-state.svelte'
	import {appPresence} from '$lib/presence.svelte'
	import {sdk} from '@radio4000/sdk'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const FEATURED_COUNT = 3
	const FEATURED_COUNT_LOGGEDOUT = 6
	const FEATURED_DAYS = 30

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)

	const follows = getFollowedChannels()

	// Todo checklist: show when channel exists but onboarding is incomplete
	const showOnboarding = $derived(
		!follows.isLoading &&
			!!userChannel &&
			((userChannel.track_count ?? 0) === 0 || follows.followedChannels.length === 0)
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
				const picked = pool.toSorted((a, b) => featuredScore(b) - featuredScore(a)).slice(0, featuredPickCount)
				featuredChannels = picked
			} catch (e) {
				console.warn('[homepage] failed to load featured channels', e)
			}
		})()
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
	const userChannelIsBroadcasting = $derived(
		!!userChannel && Object.values(appState.decks).some((d) => d.broadcasting_channel_id === userChannel.id)
	)

	// User channel play state
	const userChannelPlayingDeckId = $derived.by(() => {
		if (!userChannel?.slug) return undefined
		return Object.values(appState.decks).find((d) => d.playlist_slug === userChannel.slug && d.is_playing)?.id
	})
	const userChannelIsPlaying = $derived(!!userChannelPlayingDeckId)
	function toggleUserChannelPlay() {
		if (!userChannel) return
		if (userChannelPlayingDeckId) togglePlayPause(userChannelPlayingDeckId)
		else playChannel(appState.active_deck_id, userChannel)
	}

	// Auto radio state for user's channel
	const userChannelAutoDecks = $derived.by(() => {
		if (!userChannel?.slug) return []
		return Object.values(appState.decks).filter(
			(d) =>
				d.auto_radio && (d.view?.sources[0]?.channels?.[0] === userChannel.slug || d.playlist_slug === userChannel.slug)
		)
	})
	const userChannelHasAuto = $derived(userChannelAutoDecks.length > 0)
	const userChannelHasAutoDrifted = $derived(userChannelAutoDecks.some((d) => d.auto_radio_drifted))
	const userChannelResyncDeckId = $derived.by(() => {
		if (!userChannel?.slug || !userChannelHasAuto) return undefined
		const activeDeck = appState.decks[appState.active_deck_id]
		if (
			activeDeck?.id &&
			activeDeck.auto_radio &&
			(activeDeck.view?.sources[0]?.channels?.[0] === userChannel.slug || activeDeck.playlist_slug === userChannel.slug)
		) {
			return activeDeck.id
		}
		return userChannelAutoDecks[0]?.id
	})

	async function toggleUserChannelAutoRadio() {
		if (!userChannel) return
		if (userChannelHasAuto && userChannelResyncDeckId) {
			resyncAutoRadio(userChannelResyncDeckId)
		} else {
			await ensureTracksLoaded(userChannel.slug)
			const tracks = [...tracksCollection.state.values()].filter((t) => t.slug === userChannel.slug)
			joinAutoRadio(appState.active_deck_id, toAutoTracks(tracks), {sources: [{channels: [userChannel.slug]}]})
		}
	}

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
		{#if userChannel}
			<div class="channel-play">
				{#if userChannelIsBroadcasting}
					<a
						href={resolve(`/${userChannel.slug}`)}
						class="channel-badge live-link"
						title={m.status_broadcasting()}
						aria-label={m.status_broadcasting()}
					>
						{m.status_live_short()}
					</a>
				{/if}
				<button class="btn mini-play" onclick={toggleUserChannelPlay} title={userChannel.slug}>
					<Icon icon={userChannelIsPlaying ? 'pause' : 'play-fill'} />
					<span class="mini-play-avatar"><ChannelAvatar id={userChannel.image} alt={userChannel.name} size={64} /></span
					>
					<span class="mini-play-slug">{userChannel.slug}</span>
				</button>
				<AutoRadioButton
					className="btn{userChannelHasAuto ? ' active' : ''}"
					synced={!userChannelHasAutoDrifted}
					title={m.auto_radio_resync()}
					onclick={toggleUserChannelAutoRadio}
				/>
			</div>
		{/if}
	</menu>

	{#if isSignedIn && userChannel}
		<!-- Logged in with channel -->

		{#if showOnboarding && appState.show_onboarding_hint}
			<section class="section onboarding dismissible">
				<button class="dismiss-btn" onclick={() => (appState.show_onboarding_hint = false)} aria-label="Close">
					<Icon icon="close" />
				</button>
				<ol class="todo-list">
					<li>
						<input type="checkbox" disabled checked={(userChannel.track_count ?? 0) > 0} />
						<a href={resolve('/[slug]/tracks', {slug: userChannel.slug})}>{m.home_onboarding_add_track()}</a>
					</li>
					<li>
						<input type="checkbox" disabled checked={follows.followedChannels.length > 0} />
						<a href={resolve('/channels/featured')}>{m.home_onboarding_follow_radio()}</a>
					</li>
				</ol>
			</section>
		{/if}

		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
				<ol class="list">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if follows.followedChannels.length > 0}
			<section class="section">
				<ol class="grid">
					{#each follows.followedChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ol>
			</section>
		{/if}
	{:else if isSignedIn && authStatus.channelChecked}
		<!-- Logged in but no channel -->
		{#if appState.show_welcome_hint}
			<section class="section welcome-section dismissible">
				<button class="dismiss-btn" onclick={() => (appState.show_welcome_hint = false)} aria-label="Close">
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
					<a href={resolve('/create-channel')} class="btn primary">{m.home_create_channel()}</a>
					<a href={resolve('/about')} class="btn ghost">{m.nav_about()}</a>
				</menu>
			</section>
		{/if}

		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
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
							<button type="button" class="icon-btn" onclick={toggleFeaturedPlay}>
								<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
							</button>
						{/if}
						{#if featuredPool.length > featuredPickCount}
							<button
								type="button"
								class="icon-btn"
								title={m.home_featured_refresh()}
								onclick={pickFeatured}
								disabled={shuffling}
							>
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
	{:else}
		<!-- Not logged in -->
		{#if activeBroadcasts.length}
			<section class="section">
				<h2 class="section-title">{m.home_broadcasting()}</h2>
				<ol class="list">
					{#each activeBroadcasts as broadcast (broadcast.channel_id)}
						<li><ChannelCard channel={broadcast.channels} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if appState.show_welcome_hint}
			<section class="section welcome-section dismissible">
				<button class="dismiss-btn" onclick={() => (appState.show_welcome_hint = false)} aria-label="Close">
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
					<a href={resolve('/auth/create-account') + '?redirect=' + resolve('/create-channel')} class="btn primary"
						>{m.header_start_your_radio()}</a
					>
					<a href={resolve('/auth/login')} class="btn">{m.nav_sign_in()}</a>
					<a href={resolve('/about')} class="btn ghost">{m.nav_about()}</a>
				</menu>
			</section>
		{/if}

		{#if featuredChannels.length}
			<section class="section">
				<header class="section-header">
					<h2 class="section-title"><a href={resolve('/channels/featured')}>{m.home_featured()}</a></h2>
					<menu>
						{#if featuredFirst}
							<button type="button" class="icon-btn" onclick={toggleFeaturedPlay}>
								<Icon icon={featuredIsPlaying ? 'pause' : 'play-fill'} />
							</button>
						{/if}
						{#if featuredPool.length > featuredPickCount}
							<button
								type="button"
								class="icon-btn"
								title={m.home_featured_refresh()}
								onclick={pickFeatured}
								disabled={shuffling}
							>
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

		{#if featuredLoaded && (channelCount || trackCount || appPresence.count)}
			<p class="stats">
				{#if channelCount}<a href={resolve('/channels/all')}
						>{m.home_stats_channels({count: channelCount.toLocaleString()})}</a
					>{/if}
				{#if trackCount}<a href={resolve('/tracks/recent')}
						>{m.home_stats_tracks({count: trackCount.toLocaleString()})}</a
					>{/if}
				{#if appPresence.count}<span>{m.home_stats_listeners({count: appPresence.count})}</span>{/if}
			</p>
		{/if}
	{/if}
</div>

<style>
	.homepage {
		padding: 0.5rem;

		/* grids manage their own horizontal spacing */
		:global(.grid) {
			margin-inline: -0.5rem;
		}
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		z-index: 1;
	}

	.channel-play {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.mini-play {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding-inline: 0.5rem;
		height: 2rem;
		font-size: var(--font-3);
		max-width: 9rem;
	}

	.mini-play-avatar {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: var(--border-radius);

		:global(img, svg) {
			width: 100%;
			height: 100%;
			object-fit: cover;
			border-radius: inherit;
		}
	}

	.mini-play-slug {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.live-link {
		text-decoration: none;
		animation: live-pulse 2s ease-in-out infinite;
	}

	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
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
		font-size: var(--font-7);
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: light-dark(var(--gray-11), var(--gray-9));
	}

	.stats {
		display: flex;
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

	.dismissible {
		position: relative;
	}

	.dismiss-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		padding: 0.2rem;
		background: none;
		border: none;
		cursor: pointer;
		color: light-dark(var(--gray-9), var(--gray-8));
		line-height: 0;

		&:hover {
			color: light-dark(var(--gray-11), var(--gray-10));
		}
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
			margin-bottom: 0.75rem;
		}

		.tagline {
			font-size: var(--font-6);
			margin-bottom: 0.25rem;
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

	.onboarding {
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
