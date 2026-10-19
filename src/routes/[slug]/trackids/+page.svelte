<script>
	import {page} from '$app/state'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {eq} from '@tanstack/db'
	import {channelsCollection} from '#lib/collections/channels.js'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, page.params.slug))
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

<Seo title={m.track_urls_page_title({name: channel?.name || m.channel_page_fallback()})} plain />

{#if tracksQuery.isLoading}
	<p>{m.common_loading()}</p>
{:else}
	<pre>{trackUrls.join('\n')}</pre>
{/if}
