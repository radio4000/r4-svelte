<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {sdk} from '@radio4000/sdk'
	import {getChannelCtx} from '$lib/contexts'
	import {queryClient} from '$lib/collections/query-client'
	import {appState} from '$lib/app-state.svelte'
	import {dedupeById, extractMentions} from '$lib/utils'
	import {findChannelBySlug} from '$lib/search'
	import ChannelsView from '$lib/components/channels-view.svelte'
	import ChannelsViewControls from '$lib/components/channels-view-controls.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import * as m from '$lib/paraglide/messages'

	const FEATURED_LIMIT = 10

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

	let q = $state('')
	let following = $state([])
	let featuredChannels = $state([])
	let followingLoading = $state(true)
	let featuredLoading = $state(false)
	/** @type {'featured' | 'all'} */
	let view = $state('featured')

	const matches = (/** @type {any} */ c, /** @type {string} */ q) =>
		!q ||
		c.name?.toLowerCase().includes(q.toLowerCase()) ||
		c.slug?.toLowerCase().includes(q.toLowerCase())

	let showInCommon = $derived(Boolean(appState.user && appState.channel?.id && channel?.id))
	let featuredMentions = $derived(
		extractMentions(channel?.description ?? '')
			.map((slug) => slug.slice(1))
			.slice(0, FEATURED_LIMIT)
	)
	let activeView = $derived(
		view === 'featured' && (featuredLoading || featuredChannels.length > 0) ? 'featured' : 'all'
	)
	let visibleChannels = $derived(activeView === 'featured' ? featuredChannels : following)
	let filteredFollowing = $derived(visibleChannels.filter((c) => matches(c, q)))
	let loading = $derived(followingLoading || (activeView === 'featured' && featuredLoading))

	$effect(() => {
		if (!channel?.id) return
		q = ''
		view = page.url.searchParams.get('view') === 'all' ? 'all' : 'featured'
		featuredChannels = []
		featuredLoading = false
	})

	function onViewChange(next) {
		if (next === 'in-common') {
			goto(resolve('/[slug]/following/in-common', {slug: page.params.slug ?? ''}))
			return
		}
		const url = new URL(page.url)
		if (next === 'all') url.searchParams.set('view', 'all')
		else url.searchParams.delete('view')
		goto(url, {replaceState: true})
	}

	$effect(() => {
		if (!channel?.id) return
		followingLoading = true
		queryClient
			.fetchQuery({
				queryKey: ['channel-following', channel.id],
				queryFn: async () => {
					const {data} = await sdk.channels.readFollowings(channel.id)
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
				following = data
				followingLoading = false
			})
			.catch(() => {
				following = []
				followingLoading = false
			})
	})

	$effect(() => {
		const slugs = featuredMentions
		if (!slugs.length) {
			featuredChannels = []
			featuredLoading = false
			return
		}

		featuredLoading = true
		let stale = false
		Promise.all(slugs.map(findChannelBySlug))
			.then((results) => {
				if (stale) return
				featuredChannels = dedupeById(results.filter((c) => c !== undefined))
				featuredLoading = false
			})
			.catch(() => {
				if (stale) return
				featuredChannels = []
				featuredLoading = false
			})

		return () => {
			stale = true
		}
	})
</script>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if featuredChannels.length > 0 || showInCommon}
		<select value={view} aria-label={m.nav_following()} onchange={(e) => onViewChange(e.currentTarget.value)}>
			<option value="featured">{m.channel_section_featured_channels()}</option>
			<option value="all">{m.views_tags_all()}</option>
			{#if showInCommon}
				<option value="in-common">{m.nav_in_common()}</option>
			{/if}
		</select>
	{/if}
	{#if visibleChannels.length}
		<SearchInput
			bind:value={q}
			placeholder={m.following_search_placeholder({count: visibleChannels.length})}
		/>
		<ChannelsViewControls bind:display bind:order bind:direction />
	{/if}
{/snippet}

<svelte:head>
	<title>{m.nav_following()} - {channel?.name}</title>
</svelte:head>

<article class="channels-page fill-height">
	<Subpage
		title={m.nav_following()}
		{loading}
		empty={following.length === 0}
		emptyText={m.following_empty()}
	>
		<ChannelsView
			channels={filteredFollowing}
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
