<script>
	import {page} from '$app/state'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {eq} from '@tanstack/db'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import * as m from '$lib/paraglide/messages'

	const channelQuery = useLiveQuery((q) =>
		q.from({channels: channelsCollection}).where(({channels}) => eq(channels.slug, page.params.slug))
	)
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, page.params.slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)
	const channel = $derived(channelQuery.data?.[0])
	const trackUrls = $derived(tracksQuery.data?.map((t) => t.url) || [])
</script>

<svelte:head>
	<title>{m.track_urls_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if tracksQuery.isLoading}
	<p>{m.common_loading()}</p>
{:else}
	<pre>{trackUrls.join('\n')}</pre>
{/if}
