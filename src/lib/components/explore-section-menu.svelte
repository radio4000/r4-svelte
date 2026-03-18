<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const isSignedIn = $derived(!!appState.user)
	const isHome = $derived(page.route.id === '/')
	const isFeed = $derived(page.route.id === '/feed')
	const isChannels = $derived(page.route.id?.startsWith('/channels'))
	const isTracks = $derived(page.route.id?.startsWith('/tracks'))
	const isTags = $derived(page.route.id?.startsWith('/tags'))

	const activeIcon = $derived(
		isHome
			? 'radio'
			: isFeed
				? 'history'
				: isChannels
					? 'cell-signal'
					: isTracks
						? 'play-fill'
						: 'tag'
	)
	const activeLabel = $derived(
		isHome
			? m.home_tab_home()
			: isFeed
				? m.nav_feed()
				: isChannels
					? m.explore_tab_channels()
					: isTracks
						? m.explore_tab_tracks()
						: m.explore_tab_tags()
	)
</script>

<PopoverMenu triggerAttachment={tooltip({content: activeLabel})}>
	{#snippet trigger()}
		<Icon icon={activeIcon} />
		{activeLabel}
	{/snippet}
	<menu class="nav-vertical">
		<a href={resolve('/')} class:active={isHome}>
			<Icon icon="radio" />
			{m.home_tab_home()}
		</a>
		<a href={resolve('/channels/featured')} class:active={isChannels}>
			<Icon icon="cell-signal" />
			{m.explore_tab_channels()}
		</a>
		<a href={resolve('/tracks/recent')} class:active={isTracks}>
			<Icon icon="play-fill" />
			{m.explore_tab_tracks()}
		</a>
		<a href={resolve('/tags/featured')} class:active={isTags}>
			<Icon icon="tag" />
			{m.explore_tab_tags()}
		</a>
		{#if isSignedIn}
			<a href={resolve('/feed')} class:active={isFeed}>
				<Icon icon="history" />
				{m.nav_feed()}
			</a>
		{/if}
	</menu>
</PopoverMenu>
