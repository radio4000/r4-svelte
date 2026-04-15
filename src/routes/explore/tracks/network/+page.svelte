<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '$lib/config'
	import {tracksCollection, fetchRecentTracksForSlugs} from '$lib/collections/tracks'
	import {groupByDay} from '$lib/utils'
	import {getFollowedChannels} from '$lib/followed-channels.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import PageHeader from '$lib/components/page-header.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const DAY_OPTIONS = [7, 30, 90, 180]
	let search = $state('')

	$effect(() => {
		const q = search.trim()
		if (!q) return
		goto(`/search/tracks?q=${encodeURIComponent(q)}`, {replaceState: true})
	})

	// Days filter from URL param, default 30
	const days = $derived.by(() => {
		const n = parseInt(page.url.searchParams.get('days') ?? '')
		return DAY_OPTIONS.includes(n) ? n : 30
	})

	const follows = getFollowedChannels()

	// Fetch tracks: only when requesting a wider window than already loaded
	let maxLoadedDays = $state(0)
	$effect(() => {
		if (!follows.followedChannels.length || days <= maxLoadedDays) return
		maxLoadedDays = days
		const since = new Date(Date.now() - days * 86400000).toISOString()
		fetchRecentTracksForSlugs(
			follows.followedChannels.map((ch) => ch.slug),
			since
		)
	})

	// Feed: tracks from followed channels within selected window, grouped by day
	const feedTracks = $derived.by(() => {
		if (!follows.followedChannels.length) return []
		const since = new Date(Date.now() - days * 86400000).toISOString()
		const slugSet = new Set(follows.followedChannels.map((ch) => ch.slug))
		// Access .size so this derived re-runs when tracks are upserted into the collection
		void tracksCollection.state.size
		return groupByDay(
			[...tracksCollection.state.values()]
				.filter((t) => t?.slug && slugSet.has(t.slug) && (t.created_at ?? '') >= since)
				.toSorted(
					(a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
				)
		)
	})

	function setDays(n) {
		const q = new URL(page.url).searchParams
		if (n === 30) q.delete('days')
		else q.set('days', String(n))
		const qs = q.toString()
		goto(qs ? `?${qs}` : resolve('/explore/tracks/network'), {replaceState: true, keepFocus: true})
	}
</script>

<svelte:head>
	<title>{m.nav_feed()} — {appName}</title>
</svelte:head>

<div class="feed">
	<PageHeader>
		<ExploreSectionMenu />

		<PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}
				<Icon icon="filter-alt" />
				{m.nav_feed()}
			{/snippet}
			<menu class="nav-vertical">
				<button onclick={() => goto(resolve('/explore/tracks/recent'))}>{m.explore_tracks_filter_recent()}</button
				>
				<button onclick={() => goto(resolve('/explore/tracks/featured'))}
					>{m.explore_tracks_filter_featured()}</button
				>
				<button class:active={true} onclick={() => goto(resolve('/explore/tracks/network'))}
					>{m.nav_feed()}</button
				>
			</menu>
		</PopoverMenu>

		<SearchInput bind:value={search} debounce={300} placeholder={m.search_placeholder()} />

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
	</PageHeader>

	{#if feedTracks.length}
		{#each feedTracks as group (group.label)}
			<p class="day-header">{group.label}</p>
			<ul class="list">
				{#each group.tracks as track (track.id)}
					<li class="track-with-channel">
						<TrackCard {track} />
						<ChannelMicroCard slug={track.slug} />
					</li>
				{/each}
			</ul>
		{/each}
	{:else if follows.isLoading || (follows.followedIds.length > 0 && maxLoadedDays === 0)}
		<p class="empty">{m.common_loading()}</p>
	{:else if follows.followedIds.length === 0}
		<p class="empty">{m.home_feed_no_follows()}</p>
	{:else}
		<p class="empty">{m.home_feed_empty({days})}</p>
	{/if}
</div>

<style>
	.track-with-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		padding-inline: 0.5rem;
	}

	.track-with-channel :global(article) {
		flex: 1;
		min-width: 0;
	}

	.track-with-channel :global(.card) {
		padding-inline-start: 0;
	}

	.feed {
		padding: 0.5rem;
	}

	:global(.page-header) {
		padding-bottom: 0.25rem;
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
		margin-top: 1rem;
		color: light-dark(var(--gray-10), var(--gray-9));
	}
</style>
