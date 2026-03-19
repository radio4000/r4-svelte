<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {untrack} from 'svelte'
	import {setChannelCtx, setTracksQueryCtx} from '$lib/contexts'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {tracksCollection, checkTracksFreshness} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import {buildDeckChannelHeaderState} from '$lib/components/deck-channel-header-shared'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {joinAutoRadio, resyncAutoRadio} from '$lib/api'
	import {watchPresence, unwatchPresence, channelPresence} from '$lib/presence.svelte'

	let {children} = $props()
	let slug = $derived(page.params.slug as string)
	let rssHref = $derived(resolve('/[slug].rss', {slug}))
	let tid = $derived(page.params.tid)
	let routeId = $derived(page.route.id)

	// Resolve channel: slug → ID on first hit, then query by stable ID.
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

	// Redirect when the channel's slug drifts from the URL (e.g. after editing)
	$effect(() => {
		if (channel?.slug && channel.slug !== slug) {
			const subpath = page.url.pathname.replace(`/${slug}`, `/${channel.slug}`)
			goto(subpath, {replaceState: true})
		}
	})
	let isListeningToChannel = $derived(
		Boolean(channel?.id && Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id))
	)
	let isChannelPlaying = $derived(
		Boolean(
			channel?.slug && Object.values(appState.decks).some((d) => d.playlist_slug === channel.slug && d.is_playing)
		)
	)
	let canEdit = $derived(canEditChannel(channel?.id))
	let isLocal = $derived(isLocalChannel(channel?.id))
	let hasChannel = $derived((appState.channels?.length ?? 0) > 0)
	let authUrl = $derived(`/auth?redirect=${encodeURIComponent(page.url.pathname)}`)
	// Any auto deck playing this channel, regardless of tag/search filter
	let anyChannelAutoDecks = $derived.by(() =>
		Object.values(appState.decks).filter(
			(d) => d.auto_radio && (d.view?.sources[0]?.channels?.[0] === channel?.slug || d.playlist_slug === channel?.slug)
		)
	)
	let anyChannelAutoActive = $derived(anyChannelAutoDecks.length > 0)
	let anyChannelAutoDrifted = $derived(anyChannelAutoDecks.some((d) => d.auto_radio_drifted))
	let channelAutoResyncId = $derived.by(() => {
		const active = appState.decks[appState.active_deck_id]
		if (
			active?.auto_radio &&
			(active?.view?.sources[0]?.channels?.[0] === channel?.slug || active?.playlist_slug === channel?.slug)
		)
			return active.id
		return anyChannelAutoDecks[0]?.id
	})
	let channelPlayingDeck = $derived.by(() => {
		if (!channel?.slug) return undefined
		const active = appState.decks[appState.active_deck_id]
		if (active && active.playlist_slug === channel.slug) return active
		return Object.values(appState.decks).find((d) => d.playlist_slug === channel.slug && d.is_playing)
	})
	let channelListeningDeck = $derived.by(() => {
		if (!channel?.id) return undefined
		const active = appState.decks[appState.active_deck_id]
		if (active?.listening_to_channel_id === channel.id) return active
		return Object.values(appState.decks).find((d) => d.listening_to_channel_id === channel.id)
	})
	let channelHeaderDeck = $derived(channelListeningDeck ?? channelPlayingDeck ?? anyChannelAutoDecks[0])
	let listeningTrackSlug = $derived.by(() => {
		const trackId = channelListeningDeck?.playlist_track
		if (!trackId) return undefined
		void tracksCollection.state.size
		return tracksCollection.state.get(trackId)?.slug
	})
	let channelHeaderState = $derived.by(() =>
		buildDeckChannelHeaderState({
			title: channel?.name,
			slug,
			playlistTitle: channelHeaderDeck?.playlist_title,
			listening: Boolean(channelListeningDeck),
			listeningWhoSlug: channelListeningDeck ? slug : undefined,
			listeningWhomTrackSlug: listeningTrackSlug,
			listeningWhomFallbackSlug: channelListeningDeck?.playlist_slug,
			tagBaseSlug: slug
		})
	)

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

	// Tracks query lives in layout - stays alive during [slug]/* navigation
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

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
					<a href={resolve('/[slug]/image', {slug})} tabindex="-1">
						<ChannelAvatar id={channel.image} alt={channel.name} size={80} />
					</a>
				</div>
				<div class="info">
					<DeckChannelHeader
						title={channelHeaderState.title}
						titleHref={channelHeaderState.slugHref}
						titleElement="h1"
						titleClass="channel-page-title"
						isPlaying={isChannelPlaying}
						isBroadcasting={isChannelLive}
						slug={channelHeaderState.slug}
						slugHref={channelHeaderState.slugHref}
						tags={channelHeaderState.tags}
						listeningWhoSlug={channelListeningDeck ? channelHeaderState.listeningWhoSlug : undefined}
						listeningWhoHref={channelListeningDeck ? channelHeaderState.listeningWhoHref : undefined}
						listeningWhomSlug={channelListeningDeck ? channelHeaderState.listeningWhomSlug : undefined}
						listeningWhomHref={channelHeaderState.listeningWhomHref}
						showBroadcastSync={Boolean(channelListeningDeck && channel.id)}
						broadcastSyncDrifted={Boolean(channelListeningDeck?.listening_drifted)}
						broadcastSyncTitle={channelListeningDeck?.listening_drifted
							? m.player_sync_broadcast()
							: m.player_broadcast_synced()}
						onBroadcastSyncClick={() => {
							if (!channel?.id) return
							joinBroadcast(appState.active_deck_id, channel.id)
						}}
						presenceCount={channelPresence[channel.slug]?.total ?? 0}
					/>
				</div>
				<menu class="channel-actions">
					{#if canEdit}
						<span>
							<BroadcastControls
								deckId={appState.active_deck_id}
								channelId={channel.id}
								channelSlug={channel.slug}
								isLiveOverride={isChannelLive}
								compact
							/>
						</span>
					{:else if channel.id && isChannelLive}
						<span>
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
						</span>
					{/if}
					<span>
						<ButtonPlay {channel} trackId={tid} />
						{#if canShowAutoRadio}
							<AutoRadioButton
								synced={anyChannelAutoActive && !anyChannelAutoDrifted}
								title={anyChannelAutoActive ? m.auto_radio_resync() : m.auto_radio_join()}
								ariaLabel={anyChannelAutoActive ? m.auto_radio_resync() : m.auto_radio_join()}
								onclick={() => {
									if (anyChannelAutoActive && channelAutoResyncId) resyncAutoRadio(channelAutoResyncId)
									else if (channel)
										joinAutoRadio(appState.active_deck_id, autoRadioTracks, {sources: [{channels: [channel.slug]}]})
								}}
							/>
						{/if}
					</span>
					<span>
						{#if hasChannel}
							<ButtonFollow {channel} />
						{:else}
							<a href={authUrl} class="btn" title={m.common_follow()}>
								<Icon icon="favorite" />
							</a>
						{/if}
					</span>
					<span>
						<button
							type="button"
							onclick={() => (appState.modal_share = {channel})}
							title={m.share_native()}
							aria-label={m.share_native()}
						>
							<Icon icon="share" />
						</button>
					</span>
				</menu>
			</header>

			<div class="tabs channel-nav">
				<nav aria-label={m.nav_tracks()}>
					<a href={resolve('/[slug]', {slug})} class:active={routeId === '/[slug]'}>
						<Icon icon="circle-info" />
						Info
					</a>
					<a href={resolve('/[slug]/tracks', {slug})} class:active={routeId?.startsWith('/[slug]/tracks')}>
						<Icon icon="unordered-list" />
						{m.nav_tracks()} ({allChannelTracks.length})
					</a>
					<a href={resolve('/[slug]/tags', {slug})} class:active={routeId?.startsWith('/[slug]/tags')}>
						<Icon icon="hash" />
						{m.channel_tags_link()}
					</a>
					<a href={resolve('/[slug]/mentions', {slug})} class:active={routeId?.startsWith('/[slug]/mentions')}>
						<Icon icon="user" />
						Mentions
					</a>
					<a href={resolve('/[slug]/following', {slug})} class:active={routeId?.startsWith('/[slug]/following')}>
						<Icon icon="sparkles" />
						{m.nav_following()}
					</a>
					<a href={resolve('/[slug]/followers', {slug})} class:active={routeId?.startsWith('/[slug]/followers')}>
						<Icon icon="users" />
						{m.nav_followers()}
					</a>
					{#if channel.longitude && channel.latitude}
						<a href={resolve('/[slug]/map', {slug})} class:active={routeId?.startsWith('/[slug]/map')}>
							<Icon icon="map" />
							{m.nav_map()}
						</a>
					{/if}
				</nav>
				{#if canEdit}
					<nav class="channel-nav-secondary" aria-label={m.common_edit()}>
						<a href={resolve('/[slug]/edit', {slug})} class:active={routeId?.startsWith('/[slug]/edit')}>
							<Icon icon="settings" />
							{m.common_edit()}
						</a>
						<a href={resolve('/[slug]/batch-edit', {slug})} class:active={routeId?.startsWith('/[slug]/batch-edit')}>
							<Icon icon="unordered-list" />
							{m.batch_edit_nav_label()}
						</a>
						<a href={resolve('/[slug]/backup', {slug})} class:active={routeId?.startsWith('/[slug]/backup')}>
							<Icon icon="document-download" />
							Backup
						</a>
					</nav>
				{:else if isLocal}
					<nav class="channel-nav-secondary" aria-label={m.channel_local_nav_label()}>
						<a href={resolve('/[slug]/delete', {slug})} class:active={routeId?.startsWith('/[slug]/delete')}>
							<Icon icon="delete" />
							Delete
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
