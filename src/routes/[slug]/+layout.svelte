<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {eq} from '@tanstack/db'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
	let slug = $derived(page.params.slug)
	let routeId = $derived(page.route.id)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.limit(1)
	)
	let channel = $derived(channelQuery.data?.[0])
	let canEdit = $derived(!!appState.user && appState.channels?.includes(channel?.id))
</script>

<div class="slug-layout">
	<nav class="slug-header">
		<a href="/{slug}" class="slug-link">@{slug}</a>
		<div class="slug-nav">
			<a href="/{slug}" class:active={routeId === '/[slug]'}>{m.nav_tracks()}</a>
			<a href="/{slug}/tags" class:active={routeId?.startsWith('/[slug]/tags')}>{m.channel_tags_link()}</a>
			<a href="/{slug}/favorites" class:active={routeId?.startsWith('/[slug]/favorites')}>{m.nav_following()}</a>
			<a href="/{slug}/followers" class:active={routeId?.startsWith('/[slug]/followers')}>{m.nav_followers()}</a>
			{#if canEdit}
				<a href="/{slug}/edit" class:active={routeId?.startsWith('/[slug]/edit')}>{m.common_edit()}</a>
				<a href="/{slug}/batch-edit" class:active={routeId?.startsWith('/[slug]/batch-edit')}>Batch edit</a>
			{/if}
		</div>
	</nav>
	{@render children()}
</div>

<style>
	.slug-header {
		padding: 0.5rem 1rem 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}
	.slug-link {
		color: var(--gray-9);
		font-weight: 500;
		text-decoration: none;
		font-size: var(--font-1);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.slug-link:hover {
		color: var(--accent-9);
	}
	.slug-nav {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		font-size: var(--font-2);
		flex: 1;
	}
	.slug-nav a {
		text-decoration: none;
		color: var(--gray-10);
		white-space: nowrap;
	}
	.slug-nav a:hover,
	.slug-nav a.active {
		color: var(--accent-9);
	}
</style>