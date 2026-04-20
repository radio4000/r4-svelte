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
	import {hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {findAutoDecksForChannel, findChannelPlayingDeck, findListeningDeck} from '$lib/deck'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import ChannelSectionMenu from '$lib/components/channel-section-menu.svelte'
	import * as m from '$lib/paraglide/messages'
	import {watchPresence, unwatchPresence, channelPresence} from '$lib/presence.svelte'

	// --- Props & route params ---

	let {children} = $props()
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
	let isChannelLoaded = $derived(
		Boolean(channel?.slug && activeDeck?.playlist_slug === channel.slug)
	)
	let isChannelPlaying = $derived(Boolean(isChannelLoaded && activeDeck?.is_playing))
	let isAutoEnabled = $derived(
		Boolean(activeDeck?.auto_radio && activeDeck?.playlist_slug === slug)
	)
	let canShowAutoButton = $derived(hasAutoRadioCoverage(allChannelTracks))
	let activeAutoDrifted = $derived(Boolean(isAutoEnabled && activeDeck?.auto_radio_drifted))
	let autoPresenceCount = $derived(
		channel?.slug ? (channelPresence[channel.slug]?.byUri?.[`@${channel.slug}`] ?? 0) : 0
	)
	let livePresenceCount = $derived(
		channel?.slug ? (channelPresence[channel.slug]?.broadcast ?? 0) : 0
	)
	let playLoading = $state(false)
	let liveLoading = $state(false)
	let userChannelSlug = $derived(appState.channel?.slug ?? '')
	let playTooltip = $derived(isChannelPlaying ? m.player_tooltip_pause() : m.player_tooltip_play())
	let playLabel = $derived(
		playTooltip
			.replace(/\s*<kbd>[^<]*<\/kbd>/gi, '')
			.replace(/<[^>]+>/g, '')
			.trim()
	)
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

	$effect(() => {
		if (userChannelSlug) {
			void ensureTracksLoaded(userChannelSlug)
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

<div class="channel-layout fill-height" style="--channel-sticky-height: {channelStickyHeight}px">
	<div class="channel-sticky" bind:clientHeight={channelStickyHeight}>
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

				<div class="channel-secondary-actions">
					{#if (appState.channels?.length ?? 0) > 0}
						<ButtonFollow {channel} />
					{:else}
						<a href={authHref} class="btn" {@attach tooltip({content: m.common_follow()})}>
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
									Backup
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
							<button
								type="button"
								onclick={() => (appState.modal_share = {channel})}
							>
								<Icon icon="share" />
								{m.share_native()}
							</button>
						</menu>
					</PopoverMenu>
				</div>

				<div class="channel-controls">
					<menu class="channel-actions">
						<div class="mode-action-group" role="group" aria-label="Channel actions">
							{#if canEdit || isChannelLive || isListeningToChannel}
								<button
									type="button"
									class={[
										'mode-action',
										'live',
										{active: canEdit ? isChannelLive : isListeningToChannel}
									]}
									onclick={onLiveAction}
									disabled={liveLoading}
									{@attach tooltip({
										content: canEdit
											? isChannelLive
												? m.broadcast_stop_button()
												: m.broadcast_start_button()
											: isListeningToChannel
												? m.broadcasts_leave()
												: m.broadcasts_join()
									})}
								>
									<Icon icon="signal" size={14} />
									<span>
										{#if canEdit}
											{isChannelLive ? m.broadcast_stop_button() : m.broadcast_start_button()}
										{:else if isListeningToChannel}
											{m.status_live_short()}
										{:else}
											{m.broadcasts_join()}
										{/if}
									</span>
									{#if livePresenceCount > 0}
										<PresenceCount count={livePresenceCount} />
									{/if}
								</button>
							{/if}

							{#if canShowAutoButton}
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
							{/if}

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
						</div>
					</menu>
				</div>
			</header>
		{/if}

		{#if !isTrackDetail}
			<menu class="channel-nav">
				{#if page.route.id !== '/[slug]/image'}
					<ChannelSectionMenu
						{slug}
						{channel}
						trackCount={allChannelTracks.length}
					/>
				{/if}
				{#if channelNavControls}
					<menu class="channel-nav-controls">
						{@render channelNavControls()}
					</menu>
				{/if}
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
		display: grid;
		grid-template-areas:
			'main secondary'
			'controls controls';
		grid-template-columns: 1fr auto;
		gap: 0.4rem;
		padding: 0.5rem 0.5rem 0.4rem;
		min-width: 0;
		align-items: center;
	}

	@container (min-width: 500px) {
		header {
			grid-template-areas: 'main controls secondary';
			grid-template-columns: auto 1fr auto;
		}
	}

	.channel-main {
		grid-area: main;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
		font-size: var(--font-6);
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

	.channel-controls {
		grid-area: controls;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.channel-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
	}

	.mode-action-group {
		display: inline-flex;
		align-items: stretch;
		gap: 0.1rem;
		flex-wrap: nowrap;
		min-width: 0;
	}

	.mode-action {
		font-size: var(--font-2);
		font-weight: 600;
		gap: 0.35rem;
		border: none;
		border-radius: var(--border-radius);
		box-shadow: none;
	}

	.mode-action:hover {
		background: var(--gray-4);
	}

	.mode-action.play {
		color: var(--accent-11);
		background: var(--accent-3);
		border: 1px solid var(--accent-7);
	}

	.mode-action.play:hover {
		background: var(--accent-4);
	}

	.mode-action.active {
		color: var(--accent-9);
		background: var(--accent-3);
	}

	.mode-action.play.active {
		color: var(--accent-11);
		background: var(--accent-4);
		border-color: var(--accent-8);
	}

	.mode-action.auto.drifted {
		color: var(--orange-9);
	}

	.channel-secondary-actions {
		grid-area: secondary;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
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
		gap: 0.25rem;
		background: var(--gray-1);
		padding: 0.5rem 0.5rem 0.4rem;
	}

	.channel-nav-controls {
		display: flex;
		min-width: 0;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	@media (min-width: 820px) {
		.mode-action {
			padding: 0.35rem 0.55rem;
		}
	}
</style>
