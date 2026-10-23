<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {getChannelCtx} from '#lib/contexts.js'
	import {getChannelConnections, getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import {getChannelsViewState, matchesChannelQuery} from '../../channels-view-state.svelte.ts'
	import ChannelsView from '#lib/components/channels-view.svelte'
	import ChannelsViewControls from '#lib/components/channels-view-controls.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Subpage from '#lib/components/subpage.svelte'
	import ChannelNavControls from '#lib/components/channel-nav-controls.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const view = getChannelsViewState()

	const channelCtx = getChannelCtx()
	let channel = $derived(channelCtx.data)
	const follows = getFollowedChannels()

	let q = $state('')
	// Only the intersection with own follows is shown — ids suffice, channel
	// objects come from the already-loaded followed channels.
	const conn = getChannelConnections('followers', () => channel?.id, {hydrate: false})
	let loading = $derived(conn.loading || follows.isLoading)

	let followerIdSet = $derived(new Set(conn.ids))
	let commonFollowers = $derived(follows.followedChannels.filter((c) => followerIdSet.has(c.id)))
	let filteredChannels = $derived(commonFollowers.filter((c) => matchesChannelQuery(c, q)))

	function onViewChange(next) {
		if (next !== 'all') return
		goto(resolve('/[slug]/followers', {slug: page.params.slug ?? ''}))
	}
</script>

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
		<ChannelsViewControls
			bind:display={view.display}
			bind:order={view.order}
			bind:direction={view.direction}
		/>
	{/if}
{/snippet}

<Seo title={`${m.nav_in_common()} - ${channel?.name || m.channel_page_fallback()}`} plain />

<article class="channels-page fill-height">
	<ChannelNavControls controls={navControls} />
	<Subpage
		title={m.nav_in_common()}
		{loading}
		empty={commonFollowers.length === 0}
		emptyText={m.in_common_empty()}
	>
		<ChannelsView
			channels={filteredChannels}
			bind:display={view.display}
			bind:order={view.order}
			bind:direction={view.direction}
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
