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

	let following = $state([])
	let loading = $state(true)

	$effect(() => {
		if (!channel?.id) return
		loading = true
		queryClient
			.fetchQuery({
				queryKey: ['channel-following', channel.id],
				queryFn: async () => {
					const {data} = await sdk.channels.readFollowings(channel.id)
					return data || []
				},
				staleTime: 5 * 60 * 1000
			})
			.then((data) => {
				following = data
				loading = false
			})
	})
</script>

<svelte:head>
	<title>{m.nav_following()} - {channel?.name}</title>
</svelte:head>

<article>
	{#if loading}
		<header>
			<h1>{m.nav_following()}</h1>
			<p>{m.common_loading()}</p>
		</header>
	{:else if following.length === 0}
		<header>
			<h1>{m.nav_following()}</h1>
			<p>{m.following_empty()}</p>
		</header>
	{:else}
		<ChannelsView channels={following}>
			{#snippet header()}<h1>{m.nav_following()} <small>({following.length})</small></h1>{/snippet}
		</ChannelsView>
	{/if}
</article>

<style>
	article {
		padding: 0.5rem;
	}
</style>
