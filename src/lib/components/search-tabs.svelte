<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const q = $derived(page.url.searchParams.get('q') ?? '')
	function href(path) {
		return q ? `${resolve(path)}?q=${encodeURIComponent(q)}` : resolve(path)
	}

	const isAll = $derived(page.route.id === '/search')
	const isChannels = $derived(page.route.id === '/search/channels')
	const isTracks = $derived(page.route.id === '/search/tracks')

	const activeIcon = $derived(isChannels ? 'signal' : isTracks ? 'play-fill' : 'search')
	const activeLabel = $derived(
		isChannels ? m.search_tab_channels() : isTracks ? m.search_tab_tracks() : m.search_tab_all()
	)
</script>

<PopoverMenu triggerAttachment={tooltip({content: activeLabel})}>
	{#snippet trigger()}
		<Icon icon={activeIcon} />
		{activeLabel}
	{/snippet}
	<menu class="nav-vertical">
		<a href={href('/search')} class:active={isAll}>
			<Icon icon="search" />
			{m.search_tab_all()}
		</a>
		<a href={href('/search/channels')} class:active={isChannels}>
			<Icon icon="signal" />
			{m.search_tab_channels()}
		</a>
		<a href={href('/search/tracks')} class:active={isTracks}>
			<Icon icon="play-fill" />
			{m.search_tab_tracks()}
		</a>
	</menu>
</PopoverMenu>
