<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '$lib/config'
	import {channelsCollection} from '$lib/collections/channels'
	import {followsCollection} from '$lib/collections/follows'
	import {tracksCollection, fetchRecentTracksForSlugs} from '$lib/collections/tracks'
	import {loadMoreChannels} from '$lib/collections/channels'
	import {groupByDay} from '$lib/utils'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import * as m from '$lib/paraglide/messages'

	const DAY_OPTIONS = [7, 30, 90, 180]

	// Days filter from URL param, default 30
	const days = $derived.by(() => {
		const n = parseInt(page.url.searchParams.get('days') ?? '')
		return DAY_OPTIONS.includes(n) ? n : 30
	})

	// Follows — IDs only
	const followsQuery = useLiveQuery((q) => q.from({f: followsCollection}))
	const followedIds = $derived((followsQuery.data ?? []).map((f) => /** @type {{id: string}} */ (f).id))

	// Fetch followed channels into channelsCollection once followedIds are known
	let followedChannelsFetched = $state(false)
	$effect(() => {
		if (!followedIds.length || followedChannelsFetched) return
		followedChannelsFetched = true
		void (async () => {
			await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
			loadMoreChannels({idIn: followedIds.slice(), offset: 0, limit: followedIds.length})
		})()
	})

	// Resolve followed channels from channelsCollection, sorted by most recently active
	const followedChannels = $derived.by(() => {
		if (!followedIds.length) return []
		const idSet = new Set(followedIds)
		return /** @type {import('$lib/types').Channel[]} */ (
			[...channelsCollection.state.values()]
				.filter((ch) => ch && idSet.has(ch.id))
				.toSorted((a, b) => {
					const ta = a.latest_track_at ? new Date(a.latest_track_at).getTime() : 0
					const tb = b.latest_track_at ? new Date(b.latest_track_at).getTime() : 0
					return tb - ta
				})
		)
	})

	// Fetch: only when requesting a wider window than already loaded
	let maxLoadedDays = $state(0)
	$effect(() => {
		if (!followedChannels.length || days <= maxLoadedDays) return
		maxLoadedDays = days
		const since = new Date(Date.now() - days * 86400000).toISOString()
		fetchRecentTracksForSlugs(
			followedChannels.map((ch) => ch.slug),
			since
		)
	})

	// Feed: tracks from followed channels within selected window, grouped by day
	const feedTracks = $derived.by(() => {
		if (!followedChannels.length) return []
		const since = new Date(Date.now() - days * 86400000).toISOString()
		const slugSet = new Set(followedChannels.map((ch) => ch.slug))
		return groupByDay(
			[...tracksCollection.state.values()]
				.filter((t) => t?.slug && slugSet.has(t.slug) && (t.created_at ?? '') >= since)
				.toSorted((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
		)
	})

	function setDays(n) {
		const q = new URL(page.url).searchParams
		if (n === 30) q.delete('days')
		else q.set('days', String(n))
		const qs = q.toString()
		goto(qs ? `?${qs}` : resolve('/feed'), {replaceState: true, keepFocus: true})
	}
</script>

<svelte:head>
	<title>{m.nav_feed()} — {appName}</title>
</svelte:head>

<div class="feed">
	<menu class="filtermenu">
		<a href={resolve('/')} class="btn">{m.home_tab_home()}</a>
		<a href={resolve('/feed')} class="btn" class:active={page.route.id === '/feed'}>{m.home_tab_feed()}</a>

		<PopoverMenu style="margin-left: auto;">
			{#snippet trigger()}
				<Icon icon="history" />
				{days}d
			{/snippet}
			<menu class="nav-vertical">
				{#each DAY_OPTIONS as n (n)}
					<button class:active={days === n} onclick={() => setDays(n)}>{n} days</button>
				{/each}
			</menu>
		</PopoverMenu>
	</menu>

	{#if feedTracks.length}
		{#each feedTracks as group (group.label)}
			<p class="day-header">{group.label}</p>
			<ul class="list">
				{#each group.tracks as track (track.id)}
					<li><TrackCard {track} showSlug={true} /></li>
				{/each}
			</ul>
		{/each}
	{:else}
		<p class="empty">{m.home_feed_loading()}</p>
	{/if}
</div>

<style>
	.feed {
		padding: 0.5rem;
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
		z-index: 1;
	}

	.day-header {
		font-size: var(--font-4);
		font-weight: 600;
		color: light-dark(var(--gray-11), var(--gray-9));
		margin: 1rem 0 0.25rem;
		&:first-child {
			margin-top: 0;
		}
	}

	.empty {
		color: light-dark(var(--gray-10), var(--gray-9));
	}
</style>
