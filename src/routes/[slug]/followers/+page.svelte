<script>
	import {sdk} from '@radio4000/sdk'
	import {getChannelCtx} from '$lib/contexts'
	import {queryClient} from '$lib/collections/query-client'
	import {appState} from '$lib/app-state.svelte'
	import {dedupeById} from '$lib/utils'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import * as m from '$lib/paraglide/messages'

	let display = $state(appState.channels_display || 'grid')
	const validOrders = ['updated', 'created', 'name', 'tracks']
	/** @type {import('$lib/types').AppState['channels_order']} */
	let order = $state(validOrders.includes(appState.channels_order) ? appState.channels_order : 'updated')
	/** @type {'asc' | 'desc'} */
	let direction = $state(appState.channels_order_direction || 'desc')

	$effect(() => {
		appState.channels_display = display
		appState.channels_order = order
		appState.channels_order_direction = direction
	})

	const channelCtx = getChannelCtx()
	let channel = $derived(channelCtx.data)

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
					if (!data?.length) return []
					const ids = data.map((c) => c.id)
					const {data: enriched} = await sdk.supabase.from('channels_with_tracks').select('*').in('id', ids)
					return dedupeById(/** @type {any[]} */ (enriched || data))
				},
				staleTime: 5 * 60 * 1000
			})
			.then((data) => {
				followers = data
				loading = false
			})
			.catch(() => {
				followers = []
				loading = false
			})
	})
</script>

<svelte:head>
	<title>{m.nav_followers()} - {channel?.name}</title>
</svelte:head>

<article class="channels-page fill-height">
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
		<ChannelsView channels={followers} bind:display bind:order bind:direction>
			{#snippet header()}<h1>{m.nav_followers()} <small>({followers.length})</small></h1>{/snippet}
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
		min-height: 30px;
		display: flex;
		align-items: center;
	}
</style>
