<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {channelsCollection} from '../../tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const channelQuery = useLiveQuery((q) =>
		q.from({channels: channelsCollection}).where(({channels}) => eq(channels.slug, page.params.slug))
	)
	const channel = $derived(channelQuery.data?.[0])
	const isOwner = $derived(channel && appState.channels?.includes(channel.id))
</script>

<svelte:head>
	<title>{m.channel_update_page_title({name: channel?.name ?? page.params.slug})}</title>
</svelte:head>

{#if channelQuery.isLoading}
	<p>Loading…</p>
{:else if !channel}
	<p>{m.channel_not_found()}</p>
{:else if !isOwner}
	<p>{m.channel_update_permission()}</p>
{:else}
	<h1>{m.channel_update_heading({name: channel.name})}</h1>
	<r4-channel-update channel-id={channel.id}></r4-channel-update>
{/if}
