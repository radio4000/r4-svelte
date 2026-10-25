<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {conceptIcons} from '#lib/config.js'
	import * as m from '#lib/paraglide/messages.js'
	import PageHeader from './page-header.svelte'
	import SectionMenu from './section-menu.svelte'

	const {children, filterChips = undefined} = $props()

	const isChannels = $derived(
		page.route.id?.startsWith('/channels') || page.route.id?.startsWith('/explore/channels')
	)
	const isTracks = $derived(
		page.route.id?.startsWith('/tracks') || page.route.id?.startsWith('/explore/tracks')
	)
	const isTags = $derived(
		page.route.id?.startsWith('/tags') || page.route.id?.startsWith('/explore/tags')
	)
	const activeLabel = $derived(
		isChannels
			? m.explore_tab_channels()
			: isTracks
				? m.explore_tab_tracks()
				: isTags
					? m.explore_tab_tags()
					: m.nav_explore()
	)
	const exploreItems = $derived([
		{
			href: resolve('explore/channels/featured'),
			icon: conceptIcons.channels,
			label: m.explore_tab_channels(),
			active: isChannels
		},
		{
			href: resolve('explore/tracks/recent'),
			icon: conceptIcons.tracks,
			label: m.explore_tab_tracks(),
			active: isTracks
		},
		{
			href: resolve('explore/tags/featured'),
			icon: conceptIcons.tags,
			label: m.explore_tab_tags(),
			active: isTags
		}
	])
</script>

<PageHeader wrap>
	<nav class="explore-top-row">
		{@render children?.()}
	</nav>
	<nav class="explore-nav-row">
		<SectionMenu items={exploreItems} label={activeLabel} />
		{#if filterChips}
			<nav class="explore-filter-chips">
				{@render filterChips()}
			</nav>
		{/if}
	</nav>
</PageHeader>

<style>
	.explore-top-row {
		min-width: 0;
		gap: 0.5rem;

		& :global(.search-input) {
			flex: 1 1 0;
			min-width: 4rem;
		}
	}

	nav {
		width: 100%;
		align-items: center;
	}

	.explore-nav-row {
		gap: var(--space-2);
		justify-content: space-between;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-x: contain;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scroll-snap-type: x proximity;
	}

	.explore-nav-row > :global(.section-menu) {
		scroll-snap-align: start;
	}

	.explore-filter-chips :global(.btn.chip) {
		flex: 0 0 auto;
		scroll-snap-align: start;
	}
</style>
