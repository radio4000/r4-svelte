<script>
	import {page} from '$app/state'
	import {sdk} from '@radio4000/sdk'
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {channelsCollection, queryClient} from '$lib/tanstack/collections'
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
		if (!channel?.id) return
		loading = true
		queryClient
			.fetchQuery({
				queryKey: ['channel-followers', channel.id],
				queryFn: async () => {
					const {data} = await sdk.channels.readFollowers(channel.id)
					return data || []
				},
				staleTime: 5 * 60 * 1000
			})
			.then((data) => {
				followers = data
				loading = false
			})
	})
</script>

<svelte:head>
	<title>{m.nav_followers()} - {channel?.name}</title>
</svelte:head>

<article>
	{#if loading}
		<header>
			<h1>{m.nav_followers()}</h1>
			<p>{m.common_loading()}</p>
		</header>
	{:else if followers.length === 0}
		<header>
			<h1>{m.nav_followers()} <small>({followers.length})</small></h1>
		</header>
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
	header {
		min-height: 30px;
		display: flex;
		align-items: center;
	}
</style>
