<script>
	import {page} from '$app/state'
	import {sdk} from '@radio4000/sdk'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import {channelsCollection, queryClient} from '$lib/tanstack/collections'
	import {appState} from '$lib/app-state.svelte'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	/** @type {'grid' | 'list' | 'map' | 'infinite'} */
	let display = $state(appState.followers_display || 'grid')
	/** @type {'updated' | 'created' | 'name' | 'tracks'} */
	let order = $state(appState.followers_order || 'updated')
	/** @type {'asc' | 'desc'} */
	let direction = $state(appState.followers_direction || 'desc')

	// Sync to appState when settings change
	$effect(() => {
		appState.followers_display = display
		appState.followers_order = order
		appState.followers_direction = direction
	})

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
					if (!data?.length) return []
					const ids = data.map((c) => c.id)
					const {data: enriched} = await sdk.supabase.from('channels_with_tracks').select('*').in('id', ids)
					return enriched || data
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
