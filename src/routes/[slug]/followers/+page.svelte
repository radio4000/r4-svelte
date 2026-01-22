<script>
	import {page} from '$app/state'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {eq} from '@tanstack/db'
	import {sdk} from '@radio4000/sdk'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(1)
	)
	let channel = $derived(channelQuery.data?.[0])

	let followers = $state([])
	let loading = $state(true)

	$effect(() => {
		if (channel?.id) {
			loading = true
			sdk.channels.readFollowers(channel.id).then(({data}) => {
				if (data) followers = data
				loading = false
			})
		}
	})
</script>

<svelte:head>
	<title>{m.nav_followers()} - {channel?.name}</title>
</svelte:head>

<article>
	{#if loading}
		<h1>{m.nav_followers()}</h1>
		<p>{m.common_loading()}</p>
	{:else if followers.length === 0}
		<h1>{m.nav_followers()}</h1>
		<p>{m.empty_placeholder()}</p>
	{:else}
		<ChannelsView channels={followers}>
			{#snippet header()}<h1>{m.nav_followers()} <small>({followers.length})</small></h1>{/snippet}
		</ChannelsView>
	{/if}
</article>

<style>
	article {
		padding: 0.5rem;
	}
</style>
