<script>
	import {page} from '$app/state'
	import {setChannelCtx, setTracksQueryCtx} from '$lib/contexts'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {tracksCollection, checkTracksFreshness} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {joinAutoRadio} from '$lib/api'
	import {getAutoDecksForView} from '$lib/views.svelte'

	let {children} = $props()
	let slug = $derived(page.params.slug)
	let rssHref = $derived(`/${slug}.rss`)
	let tid = $derived(page.params.tid)
	let routeId = $derived(page.route.id)

	// Fetch channel by slug (triggers on-demand fetch)
	const channelBySlugQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.findOne()
	)
	let channel = $derived(
		/** @type {import('$lib/types').Channel | undefined} */ (/** @type {unknown} */ (channelBySlugQuery.data))
	)
	let isListeningToChannel = $derived(
		Boolean(channel?.id && Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id))
	)
	let isChannelPlaying = $derived(
		Boolean(
			channel?.slug && Object.values(appState.decks).some((d) => d.playlist_slug === channel.slug && d.is_playing)
		)
	)
	let canEdit = $derived(canEditChannel(channel?.id))
	let hasChannel = $derived((appState.channels?.length ?? 0) > 0)
	let authUrl = $derived(`/auth?redirect=${encodeURIComponent(page.url.pathname)}`)
	let fullChannelAutoView = $derived(channel?.slug ? {channels: [channel.slug]} : undefined)
	let channelAutoDecks = $derived.by(() => getAutoDecksForView(Object.values(appState.decks), fullChannelAutoView))
	let hasChannelAuto = $derived(channelAutoDecks.length > 0)
	let hasChannelAutoDrifted = $derived(channelAutoDecks.some((d) => d.auto_radio_drifted))

	// Check freshness in background (cached for 60s)
	$effect(() => {
		if (slug) {
			checkTracksFreshness(slug)
		}
	})

	// Tracks query lives in layout - stays alive during [slug]/* navigation
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

	// Channel-specific broadcast live query so "Live" state updates on this page
	let channelId = $derived(channel?.id)
	const channelBroadcastQuery = useLiveQuery((q) =>
		channelId
			? q
					.from({b: broadcastsCollection})
					.where(({b}) => eq(b.channel_id, channelId))
					.findOne()
			: q
					.from({b: broadcastsCollection})
					.orderBy(({b}) => b.channel_id, 'asc')
					.limit(0)
	)
	let isChannelLive = $derived(Boolean(channelBroadcastQuery.data))

	// Provide to child routes
	setChannelCtx({
		get data() {
			return channel
		},
		get isReady() {
			return channelBySlugQuery.isReady
		},
		get isLoading() {
			return channelBySlugQuery.isLoading
		}
	})
	setTracksQueryCtx(tracksQuery)

	let allChannelTracks = $derived(tracksQuery.data ?? [])
	let autoRadioTracks = $derived(toAutoTracks(allChannelTracks))
	let canShowAutoRadio = $derived(hasAutoRadioCoverage(allChannelTracks))
</script>

<svelte:head>
	{#if channel}
		<link rel="alternate" type="application/rss+xml" title={channel.name} href={rssHref} />
	{/if}
</svelte:head>

{#if channel}
	<div class="channel-layout fill-height">
		<div class="channel-sticky">
			<header>
				<div class="avatar">
					<a href="/{slug}/image" tabindex="-1">
						<ChannelAvatar id={channel.image} alt={channel.name} size={80} />
					</a>
				</div>
				<div class="info">
					<h1 class:active={isChannelPlaying}>
						{channel.name}
						{#if isChannelLive}<span class="channel-badge">{canEdit ? 'Broadcasting' : 'Live'}</span>{/if}
					</h1>
					<p class="slug">
						<small><a href="/{slug}">@{slug}</a></small>
					</p>
				</div>
				<menu class="channel-actions">
					<span>
						{#if canShowAutoRadio}
							<button
								type="button"
								onclick={() =>
									channel && joinAutoRadio(appState.active_deck_id, autoRadioTracks, {channels: [channel.slug]})}
								class:active={hasChannelAuto}
								class:drifted={hasChannelAutoDrifted}
								title={hasChannelAutoDrifted ? m.auto_radio_resync() : m.auto_radio_join()}
							>
								<Icon icon="signal" />
							</button>
						{/if}
						<ButtonPlay {channel} trackId={tid} />
					</span>
					<span>
						{#if canEdit}
							<BroadcastControls
								deckId={appState.active_deck_id}
								channelId={channel.id}
								isLiveOverride={isChannelLive}
								compact
							/>
						{:else if channel.id && isChannelLive}
							<button
								type="button"
								onclick={() => {
									if (isListeningToChannel) leaveBroadcast(appState.active_deck_id)
									else joinBroadcast(appState.active_deck_id, channel.id)
								}}
								title={m.nav_broadcasts()}
								aria-label={m.nav_broadcasts()}
							>
								<Icon icon="cell-signal" />
							</button>
						{/if}
					</span>
					<span>
						{#if hasChannel}
							<ButtonFollow {channel} />
						{:else}
							<a href={authUrl} class="btn" title={m.button_follow()}>
								<Icon icon="favorite" />
							</a>
						{/if}
						<button type="button" onclick={() => (appState.modal_share = {channel})} title={m.share_native()}>
							<Icon icon="share" size={16} />
						</button>
					</span>
				</menu>
			</header>

			<div class="tabs channel-nav">
				<nav aria-label={m.nav_tracks()}>
					<a href="/{slug}" class:active={routeId === '/[slug]'}>
						<Icon icon="circle-info" size={16} />
						Info
					</a>
					<a href="/{slug}/tracks" class:active={routeId?.startsWith('/[slug]/tracks')}>
						<Icon icon="unordered-list" size={16} />
						{m.nav_tracks()} ({channel.track_count ?? 0})
					</a>
					<a href="/{slug}/tags" class:active={routeId?.startsWith('/[slug]/tags')}>
						<Icon icon="hash" size={16} />
						{m.channel_tags_link()}
					</a>
					<a href="/{slug}/mentions" class:active={routeId?.startsWith('/[slug]/mentions')}>
						<Icon icon="user" size={16} />
						Mentions
					</a>
					<a href="/{slug}/following" class:active={routeId?.startsWith('/[slug]/following')}>
						<Icon icon="sparkles" size={16} />
						{m.nav_following()}
					</a>
					<a href="/{slug}/followers" class:active={routeId?.startsWith('/[slug]/followers')}>
						<Icon icon="users" size={16} />
						{m.nav_followers()}
					</a>
					{#if channel.longitude && channel.latitude}
						<a href="/{slug}/map" class:active={routeId?.startsWith('/[slug]/map')}>
							<Icon icon="map" size={16} />
							{m.nav_map()}
						</a>
					{/if}
				</nav>
				{#if canEdit}
					<nav class="channel-nav-secondary" aria-label={m.common_edit()}>
						<a href="/{slug}/edit" class:active={routeId?.startsWith('/[slug]/edit')}>
							<Icon icon="settings" size={16} />
							{m.common_edit()}
						</a>
						<a href="/{slug}/batch-edit" class:active={routeId?.startsWith('/[slug]/batch-edit')}>
							<Icon icon="unordered-list" size={16} />
							{m.batch_edit_nav_label()}
						</a>
						<a href="/{slug}/backup" class:active={routeId?.startsWith('/[slug]/backup')}>
							<Icon icon="document-download" size={16} />
							Backup
						</a>
					</nav>
				{/if}
			</div>
		</div>

		<main>
			{@render children()}
		</main>
	</div>
{:else if channelBySlugQuery.isReady}
	<p style="padding: 1rem;">{m.channel_not_found()}</p>
{/if}

<style>
	.channel-layout {
		display: flex;
		flex-direction: column;
	}

	.channel-sticky {
		position: sticky;
		top: 0;
		z-index: 20;
		background: var(--gray-1);
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--gray-4);
	}

	.avatar {
		width: 3rem;
		flex-shrink: 0;
	}

	.info {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
	}

	h1 {
		font-size: clamp(var(--font-5), 4vw, var(--font-7));
		line-height: 1.1;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: color 0.15s;

		&.active {
			color: var(--accent-9);
		}
	}

	.slug {
		color: var(--gray-10);
	}

	.channel-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.channel-actions span {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.channel-actions span + span {
		padding-left: 0.5rem;
		border-left: 1px solid var(--gray-5);
	}

	main {
		background: var(--gray-1);
		position: relative;
		z-index: 15;
		flex: 1;
		min-height: 0;
		height: 100%;
	}

	.channel-nav {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		background: var(--gray-1);
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		align-items: stretch;
		gap: 0;
	}

	.channel-nav nav {
		align-items: stretch;
		flex-shrink: 0;
		min-width: max-content;
	}

	.channel-nav-secondary {
		margin-left: auto;
	}
</style>
