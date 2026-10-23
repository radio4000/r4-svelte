<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {getChannelCtx} from '#lib/contexts.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {getChannelConnections} from '#lib/followed-channels.svelte.js'
	import {getChannelsViewState, matchesChannelQuery} from '../channels-view-state.svelte.ts'
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

	let q = $state('')
	const conn = getChannelConnections('followers', () => channel?.id)
	let followers = $derived(conn.channels)
	let loading = $derived(conn.loading)
	let showInCommon = $derived(Boolean(appState.user && appState.channel?.id && channel?.id))
	let filteredFollowers = $derived(followers.filter((c) => matchesChannelQuery(c, q)))

	function onViewChange(next) {
		if (next !== 'in-common') return
		goto(resolve('/[slug]/followers/in-common', {slug: page.params.slug ?? ''}))
	}
</script>

<ChannelNavControls controls={showInCommon || followers.length ? navControls : undefined} />

{#snippet navControls()}
	{#if showInCommon}
		<select
			value="all"
			aria-label={m.nav_followers()}
			onchange={(e) => onViewChange(e.currentTarget.value)}
		>
			<option value="all">{m.views_tags_all()}</option>
			<option value="in-common">{m.nav_in_common()}</option>
		</select>
	{/if}
	{#if followers.length}
		<SearchInput
			bind:value={q}
			placeholder={m.followers_search_placeholder({count: followers.length})}
		/>
		<ChannelsViewControls
			bind:display={view.display}
			bind:order={view.order}
			bind:direction={view.direction}
		/>
	{/if}
{/snippet}

<Seo title={`${m.nav_followers()} - ${channel?.name || m.channel_page_fallback()}`} plain />

<article class="channels-page fill-height">
	<Subpage
		title={m.nav_followers()}
		{loading}
		empty={followers.length === 0}
		emptyText={m.followers_empty()}
	>
		<ChannelsView
			channels={filteredFollowers}
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
