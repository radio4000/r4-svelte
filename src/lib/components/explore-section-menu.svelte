<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {conceptIcons} from '$lib/config'
	import * as m from '$lib/paraglide/messages'

	const isSignedIn = $derived(!!appState.user)
	const isFeed = $derived(
		page.route.id === '/feed' ||
			page.route.id === '/explore/feed' ||
			page.route.id === '/tracks/network' ||
			page.route.id === '/explore/tracks/network'
	)
	const isChannels = $derived(
		page.route.id?.startsWith('/channels') || page.route.id?.startsWith('/explore/channels')
	)
	const isTracks = $derived(
		page.route.id?.startsWith('/tracks') || page.route.id?.startsWith('/explore/tracks')
	)
	const isTags = $derived(page.route.id?.startsWith('/tags') || page.route.id?.startsWith('/explore/tags'))

	const activeLabel = $derived(
		isFeed
			? m.nav_feed()
			: isChannels
				? m.explore_tab_channels()
				: isTracks
					? m.explore_tab_tracks()
					: isTags
						? m.explore_tab_tags()
						: m.nav_explore()
	)
</script>

<PopoverMenu triggerAttachment={tooltip({content: activeLabel})}>
	{#snippet trigger()}
		<Icon icon="options-vertical" />
		{activeLabel}
	{/snippet}
	<menu class="nav-vertical">
		<a href={resolve('/explore/channels/featured')} class:active={isChannels}>
			<Icon icon={conceptIcons.channels} />
			{m.explore_tab_channels()}
		</a>
		<a href={resolve('/explore/tracks/recent')} class:active={isTracks}>
			<Icon icon={conceptIcons.tracks} />
			{m.explore_tab_tracks()}
		</a>
		<a href={resolve('/explore/tags/featured')} class:active={isTags}>
			<Icon icon={conceptIcons.tags} />
			{m.explore_tab_tags()}
		</a>
		{#if isSignedIn}
			<a href={resolve('/explore/tracks/network')} class:active={isFeed}>
				<Icon icon={conceptIcons.feed} />
				{m.nav_feed()}
			</a>
		{/if}
	</menu>
</PopoverMenu>
