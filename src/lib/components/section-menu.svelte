<script module>
	import {resolve} from '$app/paths'
	import * as m from '#lib/paraglide/messages.js'

	/**
	 * Items for the channel page nav (home/tracks/tags/mentions/following/followers).
	 * @param {{slug: string, trackCount?: number, routeId?: string | null}} params
	 */
	export function channelSectionMenuItems({slug, trackCount = 0, routeId}) {
		return [
			{
				href: resolve('/[slug]', {slug}),
				icon: 'radio',
				label: m.nav_home(),
				active: routeId === '/[slug]'
			},
			{
				href: resolve('/[slug]/tracks', {slug}),
				icon: 'unordered-list',
				label: m.nav_tracks(),
				count: trackCount,
				active: routeId?.startsWith('/[slug]/tracks')
			},
			{
				href: resolve('/[slug]/tags', {slug}),
				icon: 'tag',
				label: m.channel_tags_link(),
				active: routeId?.startsWith('/[slug]/tags')
			},
			{
				href: resolve('/[slug]/mentions', {slug}),
				icon: 'message-circle',
				label: m.mentions_title_fallback(),
				active: routeId?.startsWith('/[slug]/mentions')
			},
			{
				href: resolve('/[slug]/following', {slug}),
				icon: 'favorite-fill',
				label: m.nav_following(),
				active: routeId?.startsWith('/[slug]/following')
			},
			{
				href: resolve('/[slug]/followers', {slug}),
				icon: 'users',
				label: m.nav_followers(),
				active: routeId?.startsWith('/[slug]/followers')
			}
		]
	}
</script>

<script>
	import Icon from '#lib/components/icon.svelte'

	/** @type {{items: {href: string, icon?: string, label: string, count?: number, active?: boolean}[], label?: string, scroll?: boolean}} */
	let {items, label = '', scroll = false} = $props()
</script>

<nav class="section-menu tabs" class:scroll aria-label={label}>
	{#each items as item (item.href)}
		<a href={item.href} class="btn chip" class:active={item.active}>
			{#if item.icon}<Icon icon={item.icon} size={16} />{/if}
			<span class="chip-label">
				{item.label}
				{#if item.count != null}<strong class="chip-count">{item.count.toLocaleString()}</strong
					>{/if}
			</span>
		</a>
	{/each}
</nav>

<style>
	.section-menu {
		flex-shrink: 0;
	}

	.section-menu.scroll {
		flex-wrap: nowrap;
		width: 100%;
		-webkit-overflow-scrolling: touch;
		padding-bottom: var(--space-2);
	}
</style>
