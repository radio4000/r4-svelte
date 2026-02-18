<script>
	import {page} from '$app/state'
	import {setTracksQueryCtx} from '$lib/contexts'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {
		channelsCollection,
		tracksCollection,
		broadcastsCollection,
		checkTracksFreshness
	} from '$lib/tanstack/collections'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelHero from '$lib/components/channel-hero.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import {relativeDate, relativeDateSolar} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
	let slug = $derived(page.params.slug)
	let rssHref = $derived(`/${slug}.rss`)
	let tid = $derived(page.params.tid)
	let routeId = $derived(page.route.id)

	// Reactive via useLiveQuery — updates when channel is edited. findOne() avoids scanning all rows.
	const channelQuery = useLiveQuery((q) =>
		q
			.from({ch: channelsCollection})
			.where(({ch}) => eq(ch.slug, slug))
			.findOne()
	)
	let channel = $derived(channelQuery.data)
	let isListeningToChannel = $derived(
		Boolean(channel?.id && Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id))
	)
	let canEdit = $derived(canEditChannel(channel?.id))
	let hasChannel = $derived((appState.channels?.length ?? 0) > 0)
	let authUrl = $derived(`/auth?redirect=${encodeURIComponent(page.url.pathname)}`)

	// Check freshness in background (cached for 60s)
	$effect(() => {
		if (slug) checkTracksFreshness(slug)
	})

	// Tracks query lives in layout - stays alive during [slug]/* navigation
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

	// Channel-specific broadcast live query so "Live" state updates on this page
	// even when /broadcasts is not open.
	const channelBroadcastQuery = useLiveQuery((q) =>
		channel?.id
			? q
					.from({b: broadcastsCollection})
					.where(({b}) => eq(b.channel_id, channel.id))
					.findOne()
			: q
					.from({b: broadcastsCollection})
					.orderBy(({b}) => b.channel_id, 'asc')
					.limit(0)
	)
	let isChannelLive = $derived(Boolean(channelBroadcastQuery.data))

	// Provide to child routes
	setTracksQueryCtx(tracksQuery)
</script>

<svelte:head>
	{#if channel}
		<link rel="alternate" type="application/rss+xml" title={channel.name} href={rssHref} />
	{/if}
</svelte:head>

{#if channel}
	<div class="channel-layout fill-height">
		<header>
			<div class="info">
				<h1>
					{channel.name}
					{#if isChannelLive}<span class="live-badge">Live</span>{/if}
				</h1>
				<p class="slug">
					<small><a href={page.url.pathname + page.url.search}>@{slug}</a></small>
				</p>
				<p class="dates">
					<small>
						{m.channel_since({date: relativeDateSolar(channel.created_at)})} · {m.channel_updated({
							date: relativeDate(channel.latest_track_at ?? channel.updated_at)
						})}
					</small>
				</p>
				{#if channel.url}
					<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				{/if}
				{#if channel.description}
					<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
				{/if}
			</div>
			<menu class="channel-actions">
				<ButtonPlay class="primary" {channel} trackId={tid} label={m.button_play_label()} />
				{#if channel.id && isChannelLive && !canEdit}
					<button
						type="button"
						onclick={() => {
							if (isListeningToChannel) leaveBroadcast(appState.active_deck_id)
							else joinBroadcast(appState.active_deck_id, channel.id)
						}}
					>
						<Icon icon="signal" />
						{isListeningToChannel ? m.broadcasts_leave() : m.broadcasts_join()}
					</button>
				{/if}
				{#if canEdit}
					<BroadcastControls deckId={appState.active_deck_id} channelId={channel.id} isLiveOverride={isChannelLive} />
				{/if}
				{#if hasChannel}
					<ButtonFollow {channel} />
				{:else}
					<a href={authUrl} class="btn" title={m.button_follow()}>
						<Icon icon="favorite" />
					</a>
				{/if}
				<button type="button" onclick={() => (appState.modal_share = {channel})}>
					<Icon icon="share" size={16} />
					{m.share_native()}
				</button>
			</menu>
			<div class="hero">
				<ChannelHero {channel} />
			</div>
		</header>

		<div class="tabs channel-nav">
			<nav aria-label={m.nav_tracks()}>
				<a href="/{slug}" class:active={routeId === '/[slug]' || routeId?.startsWith('/[slug]/tracks')}>
					<Icon icon="unordered-list" size={16} />
					{m.nav_tracks()} ({channel.track_count ?? 0})
				</a>
				<a href="/{slug}/tags" class:active={routeId?.startsWith('/[slug]/tags')}>
					<Icon icon="hash" size={16} />
					{m.channel_tags_link()}
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

		<main>
			{@render children()}
		</main>
	</div>
{:else}
	<p style="padding: 1rem;">{m.channel_not_found()}</p>
{/if}

<style>
	.channel-layout {
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: clamp(0.45rem, 2vw, 0.75rem);
		padding: clamp(0.45rem, 2vw, 0.7rem);
		align-items: stretch;
	}

	.info {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		flex: 1 1 auto;
	}

	h1 {
		margin-top: 0.1rem;
		font-size: clamp(var(--font-7), 7vw, var(--font-9));
		line-height: 1.05;
	}

	.live-badge {
		display: inline-block;
		vertical-align: middle;
		margin-left: 0.35rem;
		font-size: var(--font-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--accent-9);
		color: var(--gray-1);
		padding: 0 0.35rem;
		border-radius: 3px;
	}

	.description {
		white-space: pre-wrap;
	}

	.channel-actions {
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		align-self: center;
	}

	.hero {
		align-self: center;
	}

	.hero :global(figure) {
		max-width: clamp(6rem, 38vw, 9rem);
		min-width: 0;
	}

	.slug,
	.dates,
	.url {
		color: var(--gray-10);
	}

	.url {
		font-style: italic;
		color: var(--gray-9);
	}

	.url a {
		color: inherit;
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
		/*stickyontop*/
		position: sticky;
		top: 0;
		background: var(--gray-1);
		z-index: 20;
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
	}

	.channel-nav {
		align-items: stretch;
		gap: 0;
	}

	.channel-nav nav {
		align-items: stretch;
	}

	.channel-nav-secondary {
		margin-left: auto;
	}

	@media (min-width: 640px) {
		header {
			flex-direction: row;
			flex-wrap: wrap;
			column-gap: 0.8rem;
			align-items: center;
		}

		.channel-actions {
			flex-direction: column;
			justify-content: flex-start;
		}

		.hero {
			align-self: center;
		}
	}

	@media (min-width: 900px) {
		header {
			flex-wrap: nowrap;
			column-gap: 0.9rem;
			align-items: center;
		}

		.hero :global(figure) {
			max-width: clamp(6rem, 16vw, 10rem);
		}
	}
</style>
