<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {untrack} from 'svelte'
	import {setChannelCtx, setTracksQueryCtx, setChannelNavCtx} from '$lib/contexts'
	import type {Snippet} from 'svelte'
	import {eq, inArray} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {joinBroadcast} from '$lib/broadcast'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {tracksCollection, checkTracksFreshness, ensureTracksLoaded} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {shufflePlayChannel, playChannelInNewDeck, toggleChannelPlay} from '$lib/api'
	import {findAutoDecksForChannel, findChannelDeck, findListeningDeck} from '$lib/deck'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import ChannelCanvasBg from '$lib/components/channel-canvas-bg.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SectionMenu, {channelSectionMenuItems} from '$lib/components/section-menu.svelte'
	import * as m from '$lib/paraglide/messages'
	import {watchPresence, unwatchPresence} from '$lib/presence.svelte'
	import {pickRouteChannel, updateStableChannelId} from '$lib/channel-route'
	import type {Channel} from '$lib/types'

	// --- Props & route params ---

	let {children, data} = $props()
	let channelNavControls = $state<Snippet | undefined>(undefined)
	let channelStickyHeight = $state(0)
	setChannelNavCtx({
		setControls: (s) => {
			channelNavControls = s
		}
	})
	let slug = $derived(page.params.slug as string)
	let rssHref = $derived(resolve('/[slug].rss', {slug}))
	let tid = $derived(page.params.tid)
	let isTrackDetail = $derived(Boolean(tid))
	let authHref = $derived(`/auth?redirect=${encodeURIComponent(page.url.pathname)}`)

	// --- Channel resolution ---
	// Slug → ID on first hit, then query by stable ID.
	// This prevents "not found" flashes when the slug changes (edit, sync).

	const channelBySlugQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.findOne()
	)
	let channelId = $state('')
	let channelIdSourceSlug = $state('')
	let channelFromSlug = $derived(channelBySlugQuery.data)
	$effect(() => {
		const next = updateStableChannelId(slug, channelId, channelIdSourceSlug, channelFromSlug)
		if (next.channelId !== channelId) channelId = next.channelId
		if (next.channelIdSourceSlug !== channelIdSourceSlug)
			channelIdSourceSlug = next.channelIdSourceSlug
	})

	const stableChannelId = $derived(channelIdSourceSlug === slug ? channelId : '')

	// Reactive query by stable ID — survives slug changes for the same route target
	const channelByIdQuery = useLiveQuery((q) =>
		stableChannelId
			? q
					.from({channels: channelsCollection})
					.where(({channels}) => inArray(channels.id, [stableChannelId]))
					.findOne()
			: null
	)
	let channelFromId = $derived(channelByIdQuery.data)
	// `data.channel` comes from the server load. It carries the first render (SSR and
	// client nav) until the local collection has synced this channel in.
	let channel = $derived(
		pickRouteChannel(slug, channelFromSlug, channelFromId) ?? data.channel ?? undefined
	)
	let channelIsLoading = $derived(
		!channel && (channelBySlugQuery.isLoading || (Boolean(channelId) && channelByIdQuery.isLoading))
	)
	let channelIsReady = $derived(
		Boolean(channel) || (channelBySlugQuery.isReady && (!channelId || channelByIdQuery.isReady))
	)

	// --- Queries ---

	// Tracks query lives in layout — stays alive during [slug]/* navigation
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)
	let allChannelTracks = $derived(tracksQuery.data?.length ? tracksQuery.data : (data.tracks ?? []))
	// Keep the last resolved channel during the brief gap while switching channels,
	// so the header doesn't flash "@unknown" / collapse. displayChannel === channel
	// in steady state; only during the ~60ms resolution gap does it fall back to the
	// previous channel until the new one resolves. Logic/effects still use `channel`.
	let lastChannel = $state<Channel | undefined>(undefined)
	$effect(() => {
		if (channel?.id) {
			const resolved = channel
			untrack(() => (lastChannel = resolved))
		}
	})
	// Fall back to the previous channel only while the new one is still loading.
	// Once resolved-as-missing (channelIsReady && !channel) we drop it so the
	// "not found" state shows instead of a stale header.
	let displayChannel = $derived(channel ?? (channelIsReady ? undefined : lastChannel))
	// Tab count: prefer loaded tracks, fall back to the channel's known count while
	// they load — avoids a "Tracks (0)" flash on every channel switch.
	let channelTrackCount = $derived(allChannelTracks.length || displayChannel?.track_count || 0)

	// Channel-specific broadcast live query so "Live" state updates on this page
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

	// --- Deriveds ---

	let isChannelLive = $derived(Boolean(channelBroadcastQuery.data))
	let canEdit = $derived(canEditChannel(channel?.id))
	let anyChannelAutoDecks = $derived(findAutoDecksForChannel(appState.decks, channel?.slug))
	let channelListeningDeck = $derived(
		findListeningDeck(appState.decks, appState.active_deck_id, channel?.id)
	)
	// The deck the play button shows and acts on — resolved by channel, not "active",
	// so display and action never drift to different decks. Same helper toggleChannelPlay uses.
	let channelDeck = $derived(
		findChannelDeck(appState.decks, appState.active_deck_id, channel?.slug)
	)
	let isChannelPlaying = $derived(Boolean(channelDeck?.is_playing))
	let playLoading = $state(false)
	let userChannelSlug = $derived(appState.channel?.slug ?? '')
	let playLabel = $derived(isChannelPlaying ? m.player_tooltip_pause() : m.player_tooltip_play())
	let shuffleLabel = $derived(m.player_tooltip_shuffle())
	const listeningTrackQuery = useLiveQuery((q) =>
		q
			.from({t: tracksCollection})
			.where(({t}) => eq(t.id, channelListeningDeck?.playlist_track ?? ''))
	)
	let listeningTrack = $derived(listeningTrackQuery.data?.[0])

	// --- Effects ---

	// Redirect when the channel's slug drifts from the URL (e.g. after editing)
	$effect(() => {
		if (channel?.slug && channel.slug !== slug) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL parsing for navigation, not reactive state
			const url = new URL(page.url)
			url.pathname = page.url.pathname.replace(`/${slug}`, resolve('/[slug]', {slug: channel.slug}))
			goto(`${url.pathname}${url.search}${url.hash}`, {replaceState: true})
		}
	})

	// Watch presence for this channel (observe counts without tracking self)
	$effect(() => {
		const s = channel?.slug
		if (!s) return
		untrack(() => watchPresence(s))
		return () => unwatchPresence(s)
	})

	// Check freshness in background (cached for 60s)
	$effect(() => {
		if (slug) {
			checkTracksFreshness(slug)
		}
	})

	$effect(() => {
		if (userChannelSlug) {
			void ensureTracksLoaded(userChannelSlug)
		}
	})

	// Pass tid so track-detail pages start from the viewed track.
	async function onPlayAction() {
		if (!channel || playLoading) return
		playLoading = true
		try {
			await toggleChannelPlay(channel, tid)
		} finally {
			playLoading = false
		}
	}

	async function onShuffleAction() {
		if (!channel || playLoading) return
		playLoading = true
		try {
			await shufflePlayChannel(appState.active_deck_id, channel)
		} finally {
			playLoading = false
		}
	}

	// --- Context providers ---

	setChannelCtx({
		get data() {
			return channel
		},
		get isReady() {
			return channelIsReady
		},
		get isLoading() {
			return channelIsLoading
		}
	})
	// Same fallback as `channel`: serve the load's tracks until the collection syncs.
	setTracksQueryCtx({
		get data() {
			return allChannelTracks
		},
		get isReady() {
			return tracksQuery.isReady
		},
		get isLoading() {
			return tracksQuery.isLoading
		}
	})
</script>

<svelte:head>
	{#if channel}
		<link rel="alternate" type="application/rss+xml" title={channel.name} href={rssHref} />
	{/if}
</svelte:head>

<div class="channel-layout fill-height" style="--channel-sticky-height: {channelStickyHeight}px">
	<div class="channel-sticky" bind:clientHeight={channelStickyHeight}>
		{#if displayChannel}
			<header>
				<ChannelCanvasBg id={displayChannel.image} />
				<div class="channel-main">
					<div class="avatar">
						{#if isChannelLive}
							<button
								type="button"
								class="avatar-btn"
								title={m.channel_card_join_broadcast()}
								onclick={() => joinBroadcast(appState.active_deck_id, displayChannel.id)}
							>
								<ChannelAvatar id={displayChannel.image} alt={displayChannel.name} size={160} />
							</button>
						{:else}
							<a href={resolve('/[slug]/image', {slug})} tabindex="-1">
								<ChannelAvatar id={displayChannel.image} alt={displayChannel.name} size={160} />
							</a>
						{/if}
					</div>
					<div class="info">
						<DeckChannelHeader
							deck={channelListeningDeck ?? channelDeck ?? anyChannelAutoDecks[0]}
							channel={displayChannel}
							track={listeningTrack}
							titleElement="h1"
							titleClass="channel-page-title"
							titleHref={resolve('/[slug]', {slug})}
							showModeMeta={false}
						/>
					</div>
				</div>

				<div class="channel-secondary-actions">
					{#if (appState.channels?.length ?? 0) > 0}
						<ButtonFollow channel={displayChannel} />
					{:else}
						<a
							href={authHref}
							class="btn"
							rel="nofollow"
							{@attach tooltip({content: m.common_follow()})}
						>
							<Icon icon="favorite" />
						</a>
					{/if}
					<PopoverMenu triggerAttachment={tooltip({content: m.common_more()})}>
						{#snippet trigger()}<Icon icon="options-vertical" />{/snippet}
						<menu class="nav-vertical">
							{#if canEdit}
								<a
									href={resolve('/[slug]/edit', {slug})}
									class:active={page.route.id?.startsWith('/[slug]/edit')}
								>
									<Icon icon="edit" />
									{m.common_edit()}
								</a>
								<a
									href={resolve('/[slug]/batch-edit', {slug})}
									class:active={page.route.id?.startsWith('/[slug]/batch-edit')}
								>
									<Icon icon="unordered-list" />
									{m.batch_edit_nav_label()}
								</a>
								<a
									href={resolve('/[slug]/backup', {slug})}
									class:active={page.route.id?.startsWith('/[slug]/backup')}
								>
									<Icon icon="document-download" />
									{m.channel_backup_title()}
								</a>
								<a
									href={resolve('/[slug]/doctor', {slug})}
									class:active={page.route.id?.startsWith('/[slug]/doctor')}
								>
									<Icon icon="sparkles" />
									Doctor
								</a>
								<hr />
							{:else if isLocalChannel(channel?.id)}
								<a
									href={resolve('/[slug]/delete', {slug})}
									class:active={page.route.id?.startsWith('/[slug]/delete')}
								>
									<Icon icon="delete" />
									{m.channel_delete_heading()}
								</a>
								<hr />
							{/if}
							<button type="button" onclick={onPlayAction} disabled={playLoading}>
								<Icon icon={isChannelPlaying ? 'pause' : 'play-fill'} />
								{playLabel}
							</button>
							<button type="button" onclick={() => playChannelInNewDeck(displayChannel)}>
								<Icon icon="sidebar-fill-right" />
								{m.track_card_play_in_deck()}
							</button>
							<button type="button" onclick={onShuffleAction} disabled={playLoading}>
								<Icon icon="shuffle" />
								{shuffleLabel}
							</button>
							<button
								type="button"
								onclick={() => (appState.modal_share = {channel: displayChannel})}
							>
								<Icon icon="share" />
								{m.share_native()}
							</button>
						</menu>
					</PopoverMenu>
				</div>

				{#if !isTrackDetail && page.route.id !== '/[slug]/image'}
					<div class="channel-tabs">
						<SectionMenu
							items={channelSectionMenuItems({
								slug,
								trackCount: channelTrackCount,
								routeId: page.route.id
							})}
							label="Channel navigation"
							scroll
						/>
					</div>
				{/if}
			</header>
		{/if}

		{#if !isTrackDetail && channelNavControls}
			<menu class="channel-nav">
				<menu class="channel-nav-controls">
					{@render channelNavControls()}
				</menu>
			</menu>
		{/if}
	</div>

	<main>
		{#if channelIsReady && !channel}
			<p style="padding: 1rem;">{m.channel_not_found()}</p>
		{:else}
			{@render children()}
		{/if}
	</main>
</div>

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
		container-type: inline-size;
	}

	header {
		position: relative;
		display: grid;
		grid-template-areas:
			'main secondary'
			'tabs tabs';
		grid-template-columns: 1fr auto;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3) var(--space-1);
		min-width: 0;
		align-items: center;
		background: var(--gray-2);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		overflow: hidden;
	}

	.channel-nav {
		border-inline: 1px solid var(--color-interface-border);
	}

	/* When a page-owned search/filter bar follows, it takes over the bottom edge
	   (rounding + border) so the two read as one header card, not two stacked blocks. */
	header:has(+ .channel-nav) {
		border-bottom: none;
		border-radius: var(--border-radius) var(--border-radius) 0 0;
	}

	header > :not(.channel-canvas-bg) {
		position: relative;
		z-index: 1;
	}

	@container (min-width: 640px) {
		header {
			grid-template-areas:
				'main secondary'
				'tabs tabs';
			grid-template-columns: 1fr auto;
			padding: var(--space-3) var(--space-3) var(--space-2);
		}

		.avatar {
			width: 6rem;
		}

		.channel-tabs {
			margin-top: var(--space-3);
		}
	}

	.channel-tabs {
		grid-area: tabs;
		min-width: 0;
		margin-top: var(--space-2);
	}

	.channel-main {
		grid-area: main;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.avatar {
		width: 4.5rem;
		flex-shrink: 0;
	}

	.avatar-btn {
		display: block;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		width: 100%;
	}

	.info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		flex: 1 1 auto;

		:global(.deck-channel-header) {
			flex: 1;
			min-width: 0;
		}
	}

	.info :global(.channel-page-title) {
		font-size: var(--font-6);
		line-height: 1.1;
		margin: 0;
		transition: color 0.15s;
	}

	.info :global(.channel-page-title .title-link:hover),
	.info :global(.channel-page-title .title-link:focus-visible) {
		color: var(--accent-9);
	}

	.info :global(.meta-row) {
		font-size: var(--font-3);
	}

	.channel-secondary-actions {
		grid-area: secondary;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
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
		flex-direction: column;
		gap: var(--space-1);
		background: var(--gray-2);
		border-bottom: 1px solid var(--color-interface-border);
		border-radius: 0 0 var(--border-radius) var(--border-radius);
		padding: var(--space-1);
	}

	.channel-nav-controls {
		display: flex;
		min-width: 0;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
