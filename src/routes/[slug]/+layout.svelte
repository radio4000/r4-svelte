<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {untrack} from 'svelte'
	import {setChannelCtx, setTracksQueryCtx, setChannelNavCtx} from '$lib/contexts'
	import type {Snippet} from 'svelte'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {joinBroadcast, leaveBroadcast, startBroadcast, stopBroadcast} from '$lib/broadcast'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {tracksCollection, checkTracksFreshness, ensureTracksLoaded} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {
		getMediaPlayer,
		joinAutoRadio,
		playChannel,
		resyncAutoRadio,
		togglePlayPause
	} from '$lib/api'
	import {findAutoDecksForChannel, findChannelPlayingDeck, findListeningDeck} from '$lib/deck'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import Icon from '$lib/components/icon.svelte'
	import ChannelSectionMenu from '$lib/components/channel-section-menu.svelte'
	import * as m from '$lib/paraglide/messages'
	import {watchPresence, unwatchPresence, channelPresence} from '$lib/presence.svelte'

	// --- Props & route params ---

	let {children} = $props()
	let channelNavControls = $state<Snippet | undefined>(undefined)
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
	let tracksHref = $derived(
		tid ? `${resolve('/[slug]/tracks', {slug})}#track-${tid}` : resolve('/[slug]/tracks', {slug})
	)

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
	$effect(() => {
		const found = /** @type {import('$lib/types').Channel | undefined} */ (
			/** @type {unknown} */ (channelBySlugQuery.data)
		)
		if (found?.id && found.id !== channelId) channelId = found.id
	})

	// Reactive query by stable ID — survives slug changes
	const channelByIdQuery = useLiveQuery((q) =>
		channelId
			? q
					.from({channels: channelsCollection})
					.where(({channels}) => eq(channels.id, channelId))
					.findOne()
			: q
					.from({channels: channelsCollection})
					.orderBy(({channels}) => channels.id, 'asc')
					.limit(0)
	)
	let channel = $derived(
		/** @type {import('$lib/types').Channel | undefined} */ (
			/** @type {unknown} */ (channelByIdQuery.data ?? channelBySlugQuery.data)
		)
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
	let allChannelTracks = $derived(tracksQuery.data ?? [])

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
	let isListeningToChannel = $derived(
		Boolean(
			channel?.id &&
			Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id)
		)
	)
	let canEdit = $derived(canEditChannel(channel?.id))
	let anyChannelAutoDecks = $derived(findAutoDecksForChannel(appState.decks, channel?.slug))
	let channelPlayingDeck = $derived(
		findChannelPlayingDeck(appState.decks, appState.active_deck_id, channel?.slug)
	)
	let channelListeningDeck = $derived(
		findListeningDeck(appState.decks, appState.active_deck_id, channel?.id)
	)
	let activeDeck = $derived(appState.decks[appState.active_deck_id])
	let isChannelLoaded = $derived(Boolean(channel?.slug && activeDeck?.playlist_slug === channel.slug))
	let isChannelPlaying = $derived(Boolean(isChannelLoaded && activeDeck?.is_playing))
	let isAutoEnabled = $derived(Boolean(activeDeck?.auto_radio && activeDeck?.playlist_slug === slug))
	let activeAutoDrifted = $derived(Boolean(isAutoEnabled && activeDeck?.auto_radio_drifted))
	let autoPresenceCount = $derived(
		channel?.slug ? (channelPresence[channel.slug]?.byUri?.[`@${channel.slug}`] ?? 0) : 0
	)
	let livePresenceCount = $derived(channel?.slug ? (channelPresence[channel.slug]?.broadcast ?? 0) : 0)
	let playLoading = $state(false)
	let liveLoading = $state(false)
	let playTooltip = $derived(isChannelPlaying ? m.player_tooltip_pause() : m.player_tooltip_play())
	let playLabel = $derived(playTooltip.replace(/\s*<kbd>[^<]*<\/kbd>/gi, '').replace(/<[^>]+>/g, '').trim())
	let listeningTrack = $derived.by(() => {
		const trackId = channelListeningDeck?.playlist_track
		if (!trackId) return undefined
		void tracksCollection.state.size
		return tracksCollection.state.get(trackId)
	})

	// --- Effects ---

	// Redirect when the channel's slug drifts from the URL (e.g. after editing)
	$effect(() => {
		if (channel?.slug && channel.slug !== slug) {
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

	async function onLiveAction() {
		if (!channel || liveLoading) return
		liveLoading = true
		try {
			if (canEdit) {
				if (isChannelLive) {
					await stopBroadcast(channel.id)
					const deck = appState.decks[appState.active_deck_id]
					if (deck) deck.broadcasting_channel_id = undefined
					return
				}

				const deckId = appState.active_deck_id
				const deck = appState.decks[deckId]
				if (!deck?.playlist_track || deck.playlist_slug !== channel.slug) {
					await playChannel(deckId, {id: channel.id, slug: channel.slug}, tid)
				}
				const player = getMediaPlayer(deckId)
				if (player?.paused) player.play()
				const trackId = appState.decks[deckId]?.playlist_track
				if (!trackId) return
				await startBroadcast(channel.id, trackId)
				if (appState.decks[deckId]) appState.decks[deckId].broadcasting_channel_id = channel.id
				return
			}

			if (isListeningToChannel) {
				leaveBroadcast(appState.active_deck_id)
				return
			}
			if (isChannelLive) {
				await joinBroadcast(appState.active_deck_id, channel.id)
				return
			}
		} finally {
			liveLoading = false
		}
	}

	async function onPlayAction() {
		if (!channel || playLoading) return
		if (isChannelLoaded) {
			togglePlayPause(appState.active_deck_id)
			return
		}
		playLoading = true
		try {
			await playChannel(appState.active_deck_id, channel, tid)
		} finally {
			playLoading = false
		}
	}

	async function onAutoAction() {
		if (!channel) return
		const deckId = appState.active_deck_id
		const deck = appState.decks[deckId]
		if (deck?.listening_to_channel_id) {
			leaveBroadcast(deckId)
		}
		if (deck?.auto_radio && deck.playlist_slug === slug) {
			void resyncAutoRadio(deckId)
			return
		}
		await ensureTracksLoaded(slug)
		const tracks = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
		await joinAutoRadio(deckId, tracks, {sources: [{channels: [slug]}]})
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
	setTracksQueryCtx(tracksQuery)
</script>

<svelte:head>
	{#if channel}
		<link rel="alternate" type="application/rss+xml" title={channel.name} href={rssHref} />
	{/if}
</svelte:head>

<div class="channel-layout fill-height">
	<div class="channel-sticky">
		{#if channel}
			<header>
				<div class="channel-main">
					<div class="avatar">
						{#if isChannelLive}
							<button
								type="button"
								class="avatar-btn"
								title={m.channel_card_join_broadcast()}
								onclick={() => joinBroadcast(appState.active_deck_id, channel.id)}
							>
								<ChannelAvatar id={channel.image} alt={channel.name} size={80} />
							</button>
						{:else}
							<a href={resolve('/[slug]/image', {slug})} tabindex="-1">
								<ChannelAvatar id={channel.image} alt={channel.name} size={80} />
							</a>
						{/if}
					</div>
					<div class="info">
						<DeckChannelHeader
							deck={channelListeningDeck ?? channelPlayingDeck ?? anyChannelAutoDecks[0]}
							{channel}
							track={listeningTrack}
							titleElement="h1"
							titleClass="channel-page-title"
							titleHref={resolve('/[slug]', {slug})}
							showModeMeta={false}
						/>
					</div>
				</div>

				<menu class="channel-actions">
					<div class="mode-action-group" role="group" aria-label="Channel actions">
						<button
							type="button"
							class={['mode-action', 'live', {active: canEdit ? isChannelLive : isListeningToChannel}]}
							onclick={onLiveAction}
							disabled={liveLoading || (!canEdit && !isChannelLive && !isListeningToChannel)}
							{@attach tooltip({
								content: canEdit
									? isChannelLive
										? m.broadcast_stop_button()
										: m.broadcast_start_button()
									: isListeningToChannel
										? m.broadcasts_leave()
										: isChannelLive
											? m.broadcasts_join()
											: m.status_live_short()
							})}
						>
							<Icon icon="signal" size={14} />
							<span>{m.status_live_short()}</span>
							{#if livePresenceCount > 0}
								<PresenceCount count={livePresenceCount} />
							{/if}
						</button>

						<button
							type="button"
							class={['mode-action', 'play', {active: isChannelPlaying}]}
							onclick={onPlayAction}
							disabled={playLoading}
							{@attach tooltip({content: playTooltip})}
						>
							<Icon icon={isChannelPlaying ? 'pause' : 'play-fill'} size={14} />
							<span>{playLabel}</span>
						</button>

						<button
							type="button"
							class={[
								'mode-action',
								'auto',
								{active: isAutoEnabled, drifted: activeAutoDrifted}
							]}
							onclick={onAutoAction}
							{@attach tooltip({
								content: activeAutoDrifted ? m.auto_radio_resync() : m.auto_radio_join()
							})}
						>
							<Icon icon="infinite" size={14} />
							<span>Auto</span>
							{#if autoPresenceCount > 0}
								<PresenceCount count={autoPresenceCount} />
							{/if}
						</button>
					</div>

					<div class="channel-secondary-actions">
						{#if (appState.channels?.length ?? 0) > 0}
							<ButtonFollow {channel} />
						{:else}
							<a href={authHref} class="btn" {@attach tooltip({content: m.common_follow()})}>
								<Icon icon="favorite" />
							</a>
						{/if}
						<button
							type="button"
							onclick={() => (appState.modal_share = {channel})}
							{@attach tooltip({content: m.share_native()})}
						>
							<Icon icon="share" />
						</button>
					</div>
				</menu>
			</header>
		{/if}

		<menu class="channel-nav">
			{#if isTrackDetail}
				<a class="btn ghost" href={tracksHref}>
					<Icon icon="arrow-left" />
				</a>
			{:else if page.route.id !== '/[slug]/image'}
				<ChannelSectionMenu
					{slug}
					{channel}
					{canEdit}
					isLocal={isLocalChannel(channel?.id)}
					trackCount={allChannelTracks.length}
				/>
			{/if}
			{#if channelNavControls}
				<menu class="channel-nav-controls">
					{@render channelNavControls()}
				</menu>
			{/if}
		</menu>
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
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--gray-4);
		min-width: 0;
	}

	.channel-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1 1 auto;
		min-width: 0;
	}

	.avatar {
		width: 3rem;
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
		font-size: clamp(var(--font-5), 4vw, var(--font-7));
		line-height: 1.1;
		margin: 0;
		transition: color 0.15s;
	}

	.info :global(.channel-page-title.active) {
		color: var(--accent-9);
	}

	.info :global(.meta-row) {
		font-size: var(--font-3);
	}

	.channel-actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
		flex: 0 0 100%;
		justify-content: center;
		min-width: 0;
	}

	.mode-action-group {
		display: inline-flex;
		align-items: stretch;
		gap: 0;
		flex-wrap: nowrap;
		min-width: 0;
		border: 1px solid var(--gray-7);
		border-radius: var(--border-radius);
	}

	.mode-action {
		font-size: var(--font-2);
		font-weight: 600;
		gap: 0.35rem;
		border: none;
		border-right: 1px solid var(--gray-6);
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}

	.mode-action:last-child {
		border-right: none;
	}

	.mode-action:first-child {
		border-radius: var(--border-radius) 0 0 var(--border-radius);
	}

	.mode-action:last-child {
		border-radius: 0 var(--border-radius) var(--border-radius) 0;
	}

	.mode-action:hover {
		background: var(--gray-3);
	}

	.mode-action.active {
		color: var(--accent-9);
		border-right-color: var(--gray-6);
		background: transparent;
	}

	.mode-action.auto.drifted {
		color: var(--orange-9);
	}

	.channel-secondary-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: nowrap;
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
		align-items: center;
		flex-wrap: wrap;
		background: var(--gray-1);
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		padding: 0.4rem;
	}

	.channel-nav-controls {
		flex: 1;
		min-width: 0;
		align-items: center;
		flex-wrap: wrap;
	}

	@media (min-width: 820px) {
		.channel-actions {
			flex: 0 1 auto;
			margin-left: auto;
			justify-content: flex-end;
		}

		.mode-action {
			padding: 0.35rem 0.55rem;
		}
	}
</style>
