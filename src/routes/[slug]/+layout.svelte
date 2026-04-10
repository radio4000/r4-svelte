<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {untrack} from 'svelte'
	import {setChannelCtx, setTracksQueryCtx, setChannelNavCtx} from '$lib/contexts'
	import type {Snippet} from 'svelte'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {tracksCollection, checkTracksFreshness} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {toggleChannelAutoRadio} from '$lib/api'
	import {findAutoDecksForChannel, findChannelPlayingDeck, findListeningDeck} from '$lib/deck'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import BroadcastLiveControls from '$lib/components/broadcast-live-controls.svelte'
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
	let isTrackDetail = $derived(Boolean(tid))
	let slug = $derived(page.params.slug as string)
	let rssHref = $derived(resolve('/[slug].rss', {slug}))
	let tid = $derived(page.params.tid)

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
	let channelHasAutoDrifted = $derived(anyChannelAutoDecks.some((d) => d.auto_radio_drifted))
	let channelPlayingDeck = $derived(
		findChannelPlayingDeck(appState.decks, appState.active_deck_id, channel?.slug)
	)
	let channelListeningDeck = $derived(
		findListeningDeck(appState.decks, appState.active_deck_id, channel?.id)
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
			const subpath = page.url.pathname.replace(`/${slug}`, `/${channel.slug}`)
			goto(subpath, {replaceState: true})
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
						onBroadcastSyncClick={() => {
							if (!channel?.id) return
							joinBroadcast(appState.active_deck_id, channel.id)
						}}
					/>
					<BroadcastLiveControls
						channelId={channel.id}
						channelSlug={channel.slug}
						deckId={appState.active_deck_id}
						isLive={isChannelLive}
						{canEdit}
						isListening={isListeningToChannel}
						presenceCount={channelPresence[channel.slug]?.total ?? 0}
						onJoin={() => joinBroadcast(appState.active_deck_id, channel.id)}
						onLeave={() => leaveBroadcast(appState.active_deck_id)}
					/>
				</div>
				<menu class="channel-actions">
					<ButtonPlay {channel} trackId={tid} />
					<AutoRadioButton
						className="btn{anyChannelAutoDecks.length ? ' active' : ''}"
						synced={Boolean(anyChannelAutoDecks.length) &&
							anyChannelAutoDecks.some((d) => d.is_playing) &&
							!channelHasAutoDrifted}
						{@attach tooltip({
							content: channelHasAutoDrifted ? m.auto_radio_resync() : m.auto_radio_join()
						})}
						onclick={() => toggleChannelAutoRadio(slug, allChannelTracks)}
					/>
					{#if (appState.channels?.length ?? 0) > 0}
						<ButtonFollow {channel} />
					{:else}
						<a
							href={`/auth?redirect=${encodeURIComponent(page.url.pathname)}`}
							class="btn"
							{@attach tooltip({content: m.common_follow()})}
						>
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
				</menu>
			</header>
		{/if}

		<menu class="channel-nav">
			{#if isTrackDetail}
				<a class="btn ghost" href={`${resolve('/[slug]/tracks', {slug})}#${tid}`}>
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
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--gray-4);
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
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
		min-width: 10rem;

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
		flex-shrink: 0;
		margin-left: auto;
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
</style>
