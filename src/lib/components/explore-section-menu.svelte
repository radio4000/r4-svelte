<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'

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
</script>

<nav class="explore-section-menu tabs chip-tabs" aria-label={activeLabel}>
	<a href={resolve('/explore/channels/featured')} class="btn chip" class:active={isChannels}>
		{m.explore_tab_channels()}
	</a>
	<a href={resolve('/explore/tracks/recent')} class="btn chip" class:active={isTracks}>
		{m.explore_tab_tracks()}
	</a>
	<a href={resolve('/explore/tags/featured')} class="btn chip" class:active={isTags}>
		{m.explore_tab_tags()}
	</a>
</nav>

<style>
	.explore-section-menu {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.explore-section-menu :global(.btn.chip) {
		flex: 0 0 auto;
	}
</style>
