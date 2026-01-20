<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
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
	let canEdit = $derived(!!appState.user && appState.channels?.includes(channel?.id))
</script>

{#if channel}
	<div class="channel-layout">
		<header>
			<div class="info">
				<p class="slug">@{slug}</p>
				<h1>{channel.name}</h1>
				<p class="stats">
					<span><strong>{channel.track_count ?? 0}</strong> {m.nav_tracks().toLowerCase()}</span>
					<a href="/{slug}/favorites">{m.nav_following().toLowerCase()}</a>
					<a href="/{slug}/followers">{m.nav_followers().toLowerCase()}</a>
				</p>
				{#if channel.description}
					<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
				{/if}
				{#if channel.url}
					<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				{/if}
				<p class="dates">
					Since {relativeDateSolar(channel.created_at)} · Updated {relativeDate(channel.updated_at)}
				</p>
				<menu>
					<ButtonPlay {channel} label={m.button_play_label()} />
					<ButtonFollow {channel} />
				</menu>
			</div>
			<ChannelHero {channel} size={120} />
		</header>

		<nav>
			<a href="/{slug}" class:active={routeId === '/[slug]'}>
				<Icon icon="unordered-list" size={16} />
				{m.nav_tracks()}
			</a>
			<a href="/{slug}/favorites" class:active={routeId?.startsWith('/[slug]/favorites')}>
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
					Map
				</a>
			{/if}
			{#if canEdit}
				<a href="/{slug}/edit" class:active={routeId?.startsWith('/[slug]/edit')}>
					<Icon icon="settings" size={16} />
					{m.common_edit()}
				</a>
				<a href="/{slug}/batch-edit" class:active={routeId?.startsWith('/[slug]/batch-edit')}>
					<Icon icon="unordered-list" size={16} />
					Batch
				</a>
			{/if}
		</nav>

		<main>
			{@render children()}
		</main>
	</div>
{:else}
	<p style="padding: 1rem;">Channel not found</p>
{/if}

<style>
	.channel-layout {
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		gap: 1rem;
		padding: 1rem;
	}

	header :global(figure) {
		flex-shrink: 0;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	h1 {
		font-size: var(--font-6);
		margin: 0;
	}

	.slug {
		color: var(--gray-9);
		margin: 0;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0.5rem 0;
		font-size: var(--font-2);
	}

	.stats a {
		color: inherit;
		text-decoration: none;
	}

	.stats a:hover {
		text-decoration: underline;
	}

	.stats strong {
		color: var(--gray-12);
	}

	.description {
		margin: 0.5rem 0;
		line-height: 1.4;
		white-space: pre-wrap;
	}

	.url {
		margin: 0;
		font-size: var(--font-2);
	}

	.dates {
		margin: 0.5rem 0 0;
		font-size: var(--font-1);
		color: var(--gray-9);
	}

	menu {
		margin-top: 0.75rem;
	}

	nav {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--gray-5);
		overflow-x: auto;
		position: sticky;
		top: 0;
		background: var(--gray-1);
		z-index: 20;
	}

	main {
		background: var(--gray-1);
		position: relative;
		z-index: 15;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.75rem 1rem;
		text-decoration: none;
		color: var(--gray-12);
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	nav a:hover {
		background: var(--gray-3);
	}

	nav a.active {
		color: var(--accent-9);
		border-bottom-color: var(--accent-9);
	}

	@media (max-width: 500px) {
		header {
			flex-direction: column-reverse;
			align-items: center;
			text-align: center;
		}

		.stats {
			justify-content: center;
		}

		menu {
			justify-content: center;
		}
	}
</style>
