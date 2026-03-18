<script>
	import {appName} from '$lib/config'
	import Channels from '$lib/components/channels.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import * as m from '$lib/paraglide/messages'

	const {data} = $props()
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<Channels filter={data.filter} filterBasePath="/channels" searchHref="/search/channels">
	{#snippet tabs()}
		<ExploreSectionMenu />
	{/snippet}
</Channels>
