<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appName} from '#lib/config.js'
	import {fetchRecentTracksForSlugs} from '#lib/collections/tracks.js'
	import {groupByDay} from '#lib/utils.js'
	import {daysAgoIso} from '#lib/dates.js'
	import {getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import TrackCard from '#lib/components/track-card.svelte'
	import ChannelMicroCard from '#lib/components/channel-micro-card.svelte'
	import ExplorePageHeader from '#lib/components/explore-page-header.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	let search = $state('')

	$effect(() => {
		const q = search.trim()
		if (!q) return
		goto(`/search/tracks?q=${encodeURIComponent(q)}`, {replace: true})
	})

	const days = 30

	const follows = getFollowedChannels()

	// Fetch tracks: only when requesting a wider window than already loaded
	let maxLoadedDays = $state(0)
	/** @type {import('#lib/types.js').Track[]} */
	let recentTracks = $state([])
	$effect(() => {
		if (!follows.followedChannels.length || days <= maxLoadedDays) return
		maxLoadedDays = days
		const since = daysAgoIso(days)
		fetchRecentTracksForSlugs(
			follows.followedChannels.map((ch) => ch.slug),
			since
		).then((rows) => {
			recentTracks = rows
		})
	})

	// Feed: tracks from followed channels within selected window, grouped by day
	const feedTracks = $derived(groupByDay(recentTracks))
</script>

<Seo title={`${m.nav_feed()} — ${appName}`} plain />

<div class="feed">
	<ExplorePageHeader>
		{#snippet filterChips()}
			<a href={resolve('explore/tracks/recent')} class="btn chip"
				>{m.explore_tracks_filter_recent()}</a
			>
			<a href={resolve('explore/tracks/featured')} class="btn chip"
				>{m.explore_tracks_filter_featured()}</a
			>
			<a href={resolve('/explore/tracks/network')} class="btn chip active">{m.nav_feed()}</a>
		{/snippet}
		<SearchInput bind:value={search} debounce={300} placeholder={m.tracks_search_placeholder()} />
	</ExplorePageHeader>

	<div class="content">
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
</div>

<style>
	.track-with-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-1);
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
		padding: 0;
	}

	.content {
		padding: var(--space-1) 0.5rem 0.5rem;
	}

	.day-header {
		font-size: var(--font-4);
		font-weight: 600;
		text-align: center;
		color: light-dark(var(--gray-11), var(--gray-9));
		margin: 1rem 0 var(--space-1);
		&:first-child {
			margin-top: 0;
		}
	}

	.empty {
		margin-top: 1rem;
		color: light-dark(var(--gray-10), var(--gray-9));
	}
</style>
