<script>
	import {sdk} from '@radio4000/sdk'
	import {getChannelCtx} from '$lib/contexts'
	import {queryClient} from '$lib/collections/query-client'
	import {appState} from '$lib/app-state.svelte'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import * as m from '$lib/paraglide/messages'

	let display = $state(appState.channels_display || 'grid')
	const validOrders = ['updated', 'created', 'name', 'tracks']
	/** @type {import('$lib/types').AppState['channels_order']} */
	let order = $state(validOrders.includes(appState.channels_order) ? appState.channels_order : 'updated')
	/** @type {'asc' | 'desc'} */
	let direction = $state(appState.channels_order_direction || 'desc')

	// Sync to appState when settings change
	$effect(() => {
		appState.channels_display = display
		appState.channels_order = order
		appState.channels_order_direction = direction
	})

	const channelCtx = getChannelCtx()
	let channel = $derived(channelCtx.data)

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
					if (!data?.length) return []
					const ids = data.map((c) => c.id)
					const {data: enriched} = await sdk.supabase.from('channels_with_tracks').select('*').in('id', ids)
					return enriched || data
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

<article class="channels-page fill-height">
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
		<ChannelsView channels={following} bind:display bind:order bind:direction>
			{#snippet header()}<h1>{m.nav_following()} <small>({following.length})</small></h1>{/snippet}
		</ChannelsView>
	{/if}
</article>

<style>
	.channels-page {
		flex-direction: column;
	}

	.channels-page :global(.layout--map) {
		min-height: 100%;
	}

	header {
		padding: 0.5rem;
	}
</style>
