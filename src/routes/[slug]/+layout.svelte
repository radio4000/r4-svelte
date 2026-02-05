<script>
	import {page} from '$app/state'
	import {setTracksQueryCtx} from '$lib/contexts'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection, tracksCollection, checkTracksFreshness} from '$lib/tanstack/collections'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import ChannelHero from '$lib/components/channel-hero.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import {relativeDate, relativeDateSolar} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
	let slug = $derived(page.params.slug)
	let routeId = $derived(page.route.id)

	// Read channel directly from collection state (already loaded at root)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
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

	// Provide to child routes
	setTracksQueryCtx(tracksQuery)
</script>

{#if channel}
	<div class="channel-layout">
		<header>
			<div class="info">
				<p class="slug"><small>@{slug}</small></p>
				<h1>{channel.name}</h1>
				{#if channel.description}
					<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
				{/if}
				{#if channel.url}
					<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				{/if}
				<p class="dates">
					<small>
						{m.channel_since({date: relativeDateSolar(channel.created_at)})} · {m.channel_updated({
							date: relativeDate(channel.updated_at)
						})}
					</small>
				</p>
				<menu>
					<ButtonPlay {channel} label={m.button_play_label()} />
					{#if channel.source !== 'v1'}
						{#if hasChannel}
							<ButtonFollow {channel} />
						{:else}
							<a href={authUrl} class="btn" title={m.button_follow()}>
								<Icon icon="favorite" size={20} />
							</a>
						{/if}
					{/if}
					<button type="button" onclick={() => (appState.modal_share = {channel})}>
						<Icon icon="share" size={16} />
						{m.share_native()}
					</button>
				</menu>
			</div>
			<ChannelHero {channel} />
		</header>

		<nav class="horizontalOverflow">
			<a href="/{slug}" class:active={routeId === '/[slug]'}>
				<Icon icon="unordered-list" size={16} />
				{channel.track_count ?? 0}
				{m.nav_tracks()}
			</a>
			<a href="/{slug}/following" class:active={routeId?.startsWith('/[slug]/following')}>
				<Icon icon="sparkles" size={16} />
				{m.nav_following()}
			</a>
			<a href="/{slug}/followers" class:active={routeId?.startsWith('/[slug]/followers')}>
				<Icon icon="users" size={16} />
				{m.nav_followers()}
			</a>
			<a href="/{slug}/tags" class:active={routeId?.startsWith('/[slug]/tags')}>
				<Icon icon="hash" size={16} />
				{m.channel_tags_link()}
			</a>
			{#if channel.longitude && channel.latitude}
				<a
					href={`/?display=map&slug=${channel.slug}&longitude=${channel.longitude}&latitude=${channel.latitude}&zoom=15`}
				>
					<Icon icon="map" size={16} />
					{m.nav_map()}
				</a>
			{/if}
			{#if canEdit}
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
			{/if}
		</nav>

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
		padding: 0.5rem;
	}

	header :global(figure) {
		max-width: 180px;
		min-width: 6rem;
		flex-shrink: 0;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	h1 {
		font-size: var(--font-9);
	}

	.description {
		white-space: pre-wrap;
	}

	.dates {
		margin-top: 0.5rem;
		line-height: 1.2;
	}

	menu {
		margin-top: 0.75rem;
	}

	main {
		background: var(--gray-1);
		position: relative;
		z-index: 15;
	}

	nav {
		/*stickyontop*/
		position: sticky;
		top: 0;
		background: var(--gray-1);
		z-index: 20;
		border-bottom: 1px solid var(--gray-5);
	}

	@media (max-width: 500px) {
		header {
			flex-direction: column-reverse;
			align-items: center;
			text-align: center;
		}

		menu {
			justify-content: center;
		}
	}
</style>
