<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {getChannelCtx} from '#lib/contexts.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {getChannelConnections, getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import {getChannelsViewState, matchesChannelQuery} from '../../channels-view-state.svelte.ts'
	import {dedupeById, extractMentions} from '#lib/utils.js'
	import {findChannelBySlug} from '#lib/search.js'
	import ChannelsView from '#lib/components/channels-view.svelte'
	import ChannelsViewControls from '#lib/components/channels-view-controls.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Subpage from '#lib/components/subpage.svelte'
	import ChannelNavControls from '#lib/components/channel-nav-controls.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const FEATURED_LIMIT = 10

	const view = getChannelsViewState()

	const channelCtx = getChannelCtx()
	let channel = $derived(channelCtx.data)
	const follows = getFollowedChannels()

	let q = $state('')
	// Only the intersection with own follows is shown — ids suffice, channel
	// objects come from the already-loaded followed channels.
	const conn = getChannelConnections('following', () => channel?.id, {hydrate: false})
	let loading = $derived(conn.loading || follows.isLoading)
	let featuredChannels = $state([])

	let featuredMentions = $derived(
		extractMentions(channel?.description ?? '')
			.map((slug) => slug.slice(1))
			.slice(0, FEATURED_LIMIT)
	)
	let followingIdSet = $derived(new Set(conn.ids))
	let commonFollowing = $derived(follows.followedChannels.filter((c) => followingIdSet.has(c.id)))
	let filteredChannels = $derived(commonFollowing.filter((c) => matchesChannelQuery(c, q)))
	let hasFeatured = $derived(featuredChannels.length > 0)
	let isOtherChannel = $derived(
		Boolean(
			appState.user && appState.channel?.id && channel?.id && appState.channel.id !== channel.id
		)
	)
	let showInCommon = $derived(isOtherChannel && commonFollowing.length > 0)

	function followingBasePath() {
		return resolve('/[slug]/following', {slug: page.params.slug ?? ''})
	}

	function onViewChange(next) {
		const base = followingBasePath()
		if (next === 'featured') {
			goto(`${base}/featured`)
			return
		}
		if (next === 'all') {
			goto(base)
			return
		}
		goto(`${base}/in-common`)
	}

	$effect(() => {
		if (!channel?.id) return
		q = ''
	})

	$effect(() => {
		const slugs = featuredMentions
		if (!slugs.length) {
			featuredChannels = []
			return
		}

		let stale = false
		Promise.all(slugs.map(findChannelBySlug))
			.then((results) => {
				if (stale) return
				featuredChannels = dedupeById(results.filter((c) => c !== undefined))
			})
			.catch(() => {
				if (stale) return
				featuredChannels = []
			})

		return () => {
			stale = true
		}
	})

	$effect(() => {
		if (!channel?.id || loading || follows.isLoading) return
		if (!showInCommon) goto(followingBasePath(), {replace: true})
	})
</script>

{#snippet navControls()}
	<select
		value="in-common"
		aria-label={m.nav_following()}
		onchange={(e) => onViewChange(e.currentTarget.value)}
	>
		{#if hasFeatured}
			<option value="featured">{m.channel_section_featured_channels()}</option>
		{/if}
		<option value="all">{m.views_tags_all()}</option>
		{#if showInCommon}
			<option value="in-common">{m.nav_in_common()}</option>
		{/if}
	</select>
	<SearchInput
		bind:value={q}
		placeholder={m.following_search_placeholder({count: commonFollowing.length})}
	/>
	<ChannelsViewControls
		bind:display={view.display}
		bind:order={view.order}
		bind:direction={view.direction}
	/>
{/snippet}

<Seo title={`${m.nav_in_common()} - ${channel?.name || m.channel_page_fallback()}`} plain />

<article class="channels-page fill-height">
	<ChannelNavControls controls={navControls} />
	<Subpage
		title={m.nav_in_common()}
		{loading}
		empty={commonFollowing.length === 0}
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
