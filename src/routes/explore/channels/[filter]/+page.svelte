<script>
	import {appName} from '#lib/config.js'
	import Channels from '#lib/components/channels.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const {data} = $props()
</script>

<!-- `url` emits og:url + a self-referencing canonical. Self-referencing even when
     noindexed — pointing a noindexed page at another URL can spread the noindex. -->
<Seo title={m.explore_title({appName})} plain url={data.seo.canonical} />
<svelte:head>
	{#if !data.seo.indexable}
		<!-- Near-duplicate listing: don't index it, but do walk through to the channels. -->
		<meta name="robots" content="noindex, follow" />
	{/if}
</svelte:head>

<Channels
	filter={data.filter}
	filterBasePath="/explore/channels"
	searchHref="/search/channels"
	initialChannels={data.directory?.channels}
	initialCount={data.directory?.totalCount ?? 0}
/>
