<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const {data} = $props()

	const isChannelsTab = $derived(page.route.id?.startsWith('/explore/channels'))
	const isTracksTab = $derived(page.route.id?.startsWith('/explore/tracks'))
	const isTagsTab = $derived(page.route.id?.startsWith('/explore/tags'))
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<Channels filter={data.filter} filterBasePath="/explore/channels">
	{#snippet tabs()}
		<a href={resolve('/explore/channels/featured')} class="btn" class:active={isChannelsTab}>
			{m.explore_tab_channels()}
		</a>
		<a href={resolve('/explore/tracks/recent')} class="btn" class:active={isTracksTab}>
			{m.explore_tab_tracks()}
		</a>
		<a href={resolve('/explore/tags/featured')} class="btn" class:active={isTagsTab}>
			{m.explore_tab_tags()}
		</a>
	{/snippet}
</Channels>
