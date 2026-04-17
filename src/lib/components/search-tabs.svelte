<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'

	const q = $derived(page.url.searchParams.get('q') ?? '')
	function href(path) {
		return q ? `${resolve(path)}?q=${encodeURIComponent(q)}` : resolve(path)
	}

	const isAll = $derived(page.route.id === '/search')
	const isChannels = $derived(page.route.id === '/search/channels')
	const isTracks = $derived(page.route.id === '/search/tracks')
</script>

<nav class="search-tabs tabs chip-tabs">
	<a href={href('/search')} class="btn chip" class:active={isAll}>
		{m.search_tab_all()}
	</a>
	<a href={href('/search/channels')} class="btn chip" class:active={isChannels}>
		{m.search_tab_channels()}
	</a>
	<a href={href('/search/tracks')} class="btn chip" class:active={isTracks}>
		{m.search_tab_tracks()}
	</a>
</nav>

<style>
	.search-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.search-tabs :global(.btn.chip) {
		flex: 0 0 auto;
	}
</style>
