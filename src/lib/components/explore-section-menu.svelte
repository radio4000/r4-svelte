<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const isChannels = $derived(page.route.id?.startsWith('/explore/channels'))
	const isTracks = $derived(page.route.id?.startsWith('/explore/tracks'))
	const isTags = $derived(page.route.id?.startsWith('/explore/tags'))

	const activeIcon = $derived(isChannels ? 'cell-signal' : isTracks ? 'play-fill' : 'tag')
	const activeLabel = $derived(
		isChannels ? m.explore_tab_channels() : isTracks ? m.explore_tab_tracks() : m.explore_tab_tags()
	)
</script>

<PopoverMenu triggerAttachment={tooltip({content: activeLabel})}>
	{#snippet trigger()}
		<Icon icon={activeIcon} />
		{activeLabel}
	{/snippet}
	<menu class="nav-vertical">
		<a href={resolve('/explore/channels/featured')} class:active={isChannels}>
			<Icon icon="cell-signal" />
			{m.explore_tab_channels()}
		</a>
		<a href={resolve('/explore/tracks/recent')} class:active={isTracks}>
			<Icon icon="play-fill" />
			{m.explore_tab_tracks()}
		</a>
		<a href={resolve('/explore/tags/featured')} class:active={isTags}>
			<Icon icon="tag" />
			{m.explore_tab_tags()}
		</a>
	</menu>
</PopoverMenu>
