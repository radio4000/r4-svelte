<script>
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {featuredScore} from '$lib/utils'
	import {getFollowedChannels} from '$lib/followed-channels.svelte'
	import {getFeaturedPool} from '$lib/collections/featured'
	import {playChannel, togglePlayPause} from '$lib/api'
	import {authStatus} from '$lib/app-state.svelte'
	import {appPresence} from '$lib/presence.svelte'
	import {sdk} from '@radio4000/sdk'
	import ChannelCard from '$lib/components/channel-card.svelte'
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
	{#if isSignedIn && userChannel}
		<!-- Sticky header: channel card + tabs -->
		<div class="sticky-header">
			<ol class="list">
				<li><ChannelCard channel={userChannel} /></li>
			</ol>
			<nav class="tabs">
				<a href={resolve('/')} class:active={page.route.id === '/'}>{m.home_tab_home()}</a>
				<a href={resolve('/feed')} class:active={page.route.id === '/feed'}>{m.home_tab_feed()}</a>
			</nav>
		</div>
	{:else if isSignedIn}
		<nav class="tabs">
			<a href={resolve('/')} class:active={page.route.id === '/'}>{m.home_tab_home()}</a>
			<a href={resolve('/feed')} class:active={page.route.id === '/feed'}>{m.home_tab_feed()}</a>
		</nav>
	{/if}

	{#if isSignedIn && userChannel}
		<!-- Logged in with channel -->

		{#if showOnboarding}
			<section class="section onboarding">
				<ol class="todo-list">
					<li>
						<input type="checkbox" disabled checked={(userChannel.track_count ?? 0) > 0} />
						<a href={resolve('/[slug]/tracks', {slug: userChannel.slug})}>{m.home_onboarding_add_track()}</a>
					</li>
					<li>
						<input type="checkbox" disabled checked={follows.followedChannels.length > 0} />
						<a href={resolve('/explore')}>{m.home_onboarding_follow_radio()}</a>
					</li>
				</ol>
			</section>
		{/if}

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

		{#if follows.followedChannels.length > 0}
			<section class="section">
				<ol class="grid">
					{#each follows.followedChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ol>
			</section>
		{/if}

		<p class="explore-link">
			<a href={resolve('/explore')}>{m.home_explore_all()} →</a>
		</p>
	{:else if isSignedIn && authStatus.channelChecked}
		<!-- Logged in but no channel -->
		<section class="section welcome-section">
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
				<a href={resolve('/about')}>{m.nav_about()}</a>
			</menu>
		</section>

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
					<h2 class="section-title"><a href={resolve('/explore/channels/featured')}>{m.home_featured()}</a></h2>
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

		<section class="section welcome-section">
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
				<a href={resolve('/about')}>{m.nav_about()}</a>
			</menu>
		</section>

		{#if featuredLoaded && (channelCount || trackCount || appPresence.count)}
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

	.sticky-header {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--color-interface);
		padding-bottom: 0.25rem;
		margin-inline: -0.5rem;
		padding-inline: 0.5rem;

		:global(.list) {
			margin: 0;
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

	.empty {
		color: light-dark(var(--gray-10), var(--gray-9));
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
