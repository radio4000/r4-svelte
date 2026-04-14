<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {sdk} from '@radio4000/sdk'
	import {getChannelCtx} from '$lib/contexts'
	import {queryClient} from '$lib/collections/query-client'
	import {appState} from '$lib/app-state.svelte'
	import {getFollowedChannels} from '$lib/followed-channels.svelte'
	import {dedupeById} from '$lib/utils'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import ChannelsViewControls from '$lib/components/channels-view-controls.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import * as m from '$lib/paraglide/messages'

	const d = appState.channels_display
	let display = $state(d === 'grid' || d === 'list' || d === 'map' || d === 'infinite' ? d : 'grid')
	const o = appState.channels_order
	let order = $state(
		o === 'updated' || o === 'created' || o === 'name' || o === 'tracks' ? o : 'updated'
	)
	/** @type {'asc' | 'desc'} */
	let direction = $state(appState.channels_order_direction || 'desc')

	$effect(() => {
		appState.channels_display = display
		appState.channels_order = order
		appState.channels_order_direction = direction
	})

	const channelCtx = getChannelCtx()
	let channel = $derived(channelCtx.data)
	const follows = getFollowedChannels()

	let q = $state('')
	let followers = $state([])
	let loading = $state(true)

	const matches = (/** @type {any} */ c, /** @type {string} */ q) =>
		!q ||
		c.name?.toLowerCase().includes(q.toLowerCase()) ||
		c.slug?.toLowerCase().includes(q.toLowerCase())

	let commonIds = $derived(new Set(follows.followedIds))
	let commonFollowers = $derived(
		followers.filter((/** @type {any} */ c) => c.id && commonIds.has(c.id))
	)
	let filteredChannels = $derived(commonFollowers.filter((c) => matches(c, q)))

	function onViewChange(next) {
		if (next !== 'all') return
		goto(resolve('/[slug]/followers', {slug: page.params.slug ?? ''}))
	}

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
					const {data: enriched} = await sdk.supabase
						.from('channels_with_tracks')
						.select('*')
						.in('id', ids)
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

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	<select
		value="in-common"
		aria-label={m.nav_followers()}
		onchange={(e) => onViewChange(e.currentTarget.value)}
	>
		<option value="all">{m.views_tags_all()}</option>
		<option value="in-common">{m.nav_in_common()}</option>
	</select>
	{#if commonFollowers.length}
		<SearchInput
			bind:value={q}
			placeholder={m.followers_search_placeholder({count: commonFollowers.length})}
		/>
		<ChannelsViewControls bind:display bind:order bind:direction />
	{/if}
{/snippet}

<svelte:head>
	<title>{m.nav_in_common()} - {channel?.name}</title>
</svelte:head>

<article class="channels-page fill-height">
	<Subpage
		title={m.nav_in_common()}
		{loading}
		empty={commonFollowers.length === 0}
		emptyText={m.in_common_empty()}
	>
		<ChannelsView
			channels={filteredChannels}
			bind:display
			bind:order
			bind:direction
			showToolbar={false}
		/>
	</Subpage>
</article>

<style>
	.channels-page {
		flex-direction: column;
	}

	.channels-page :global(.layout--map) {
		min-height: 100%;
	}
</style>
