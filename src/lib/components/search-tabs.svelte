<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {conceptIcons} from '#lib/config.js'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const q = $derived(page.url.searchParams.get('q') ?? '')
	function href(path) {
		return q ? `${resolve(path)}?q=${encodeURIComponent(q)}` : resolve(path)
	}

	const isAll = $derived(page.route.id === '/search')
	const isChannels = $derived(page.route.id === '/search/channels')
	const isTracks = $derived(page.route.id === '/search/tracks')
</script>

<nav class="search-tabs tabs">
	<a href={href('/search')} class="btn chip" class:active={isAll}>
		<Icon icon={conceptIcons.search} size={16} />
		{m.search_tab_all()}
	</a>
	<a href={href('/search/channels')} class="btn chip" class:active={isChannels}>
		<Icon icon={conceptIcons.channels} size={16} />
		{m.search_tab_channels()}
	</a>
	<a href={href('/search/tracks')} class="btn chip" class:active={isTracks}>
		<Icon icon={conceptIcons.tracks} size={16} />
		{m.search_tab_tracks()}
	</a>
</nav>

<style>
	.search-tabs {
		flex-wrap: nowrap;
		flex-shrink: 1;
		min-width: 0;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}
</style>
