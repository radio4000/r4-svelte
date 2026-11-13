<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {gt, inArray} from '@tanstack/db'
	import {appName} from '#lib/config.js'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import {getFeaturedPool} from '#lib/collections/featured.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {groupByDay} from '#lib/utils.js'
	import {daysAgoIso} from '#lib/dates.js'
	import TrackCard from '#lib/components/track-card.svelte'
	import ChannelMicroCard from '#lib/components/channel-micro-card.svelte'
	import ExplorePageHeader from '#lib/components/explore-page-header.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const {data} = $props()

	let search = $state('')
	$effect(() => {
		const q = search.trim()
		if (!q) return
		goto(`${resolve('search/tracks')}?q=${encodeURIComponent(q)}`, {replace: true})
	})

	const LIMIT = 50
	const FEATURED_DAYS = 30
	// The query asks from the start of that day, so a return visit reuses its cache entry;
	// the list then cuts at the exact time
	const featuredSince = daysAgoIso(FEATURED_DAYS)
	const featuredSinceDay = featuredSince.slice(0, 10)

	const filterParam = $derived(data.filter)

	// Recent pages grow by LIMIT; switching filters starts over
	let limit = $state(LIMIT)
	$effect(() => {
		void filterParam
		limit = LIMIT
	})

	// Featured reads the newest tracks of the featured channel pool
	let featuredSlugs = $state(/** @type {string[] | null} */ (null))
	$effect(() => {
		if (filterParam !== 'featured' || featuredSlugs) return
		getFeaturedPool(FEATURED_DAYS).then((pool) => {
			featuredSlugs = pool.map((ch) => ch.slug)
		})
	})

	// Lexical, like the server's order: the default locale order would also load every row
	const newestFirst = /** @type {const} */ ({direction: 'desc', stringSort: 'lexical'})
	const tracksQuery = useLiveQuery((q) => {
		if (filterParam === 'recent') {
			return q
				.from({t: tracksCollection})
				.orderBy(({t}) => t.created_at, newestFirst)
				.limit(limit)
		}
		if (filterParam === 'featured' && featuredSlugs?.length) {
			const slugs = featuredSlugs
			return q
				.from({t: tracksCollection})
				.where(({t}) => inArray(t.slug, slugs))
				.where(({t}) => gt(t.created_at, featuredSinceDay))
				.orderBy(({t}) => t.created_at, newestFirst)
				.limit(LIMIT)
		}
		return null
	})

	const tracks = $derived.by(() => {
		const rows = /** @type {import('#lib/types.js').Track[]} */ (tracksQuery.data)
		if (filterParam !== 'featured') return rows
		return rows.filter((t) => (t.created_at ?? '') > featuredSince)
	})
	const loaded = $derived(
		tracksQuery.isReady || (filterParam === 'featured' && featuredSlugs?.length === 0)
	)
	// Load more moves the same query's window: it stays ready while the next page loads,
	// so the page is pending from the click until rows arrive or the collection's fetch ends
	let pending = $state(false)
	$effect(() => {
		const collection = tracksQuery.collection
		if (!collection) return
		return collection.on('loadingSubset:change', () => {
			if (!collection.isLoadingSubset) pending = false
		})
	})
	$effect(() => {
		void tracks.length
		pending = false
	})
	const loadingMore = $derived(tracksQuery.isLoading || pending)
	const loadedAll = $derived(
		filterParam !== 'recent' || (loaded && !loadingMore && tracks.length < limit)
	)

	function handleLoadMore() {
		if (filterParam !== 'recent' || loadedAll) return
		pending = true
		limit += LIMIT
	}

	const groupedTracks = $derived(groupByDay(tracks))
</script>

<Seo title={m.explore_title({appName})} plain />

<div class="layout">
	<ExplorePageHeader>
		{#snippet filterChips()}
			<a
				href={resolve('explore/tracks/recent')}
				class="btn chip"
				class:active={filterParam === 'recent'}>{m.explore_tracks_filter_recent()}</a
			>
			<a
				href={resolve('explore/tracks/featured')}
				class="btn chip"
				class:active={filterParam === 'featured'}>{m.explore_tracks_filter_featured()}</a
			>
			<a href={resolve('/explore/tracks/network')} class="btn chip">{m.nav_feed()}</a>
		{/snippet}
		<SearchInput bind:value={search} debounce={300} placeholder={m.tracks_search_placeholder()} />
	</ExplorePageHeader>

	<div class="content">
		{#if groupedTracks.length}
			{#each groupedTracks as group (group.label)}
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
			{#if !loadedAll && filterParam === 'recent'}
				<footer>
					<p>
						<button onclick={handleLoadMore} disabled={loadingMore}>
							{loadingMore ? '…' : m.channels_load_more({count: LIMIT})}
						</button>
					</p>
				</footer>
			{/if}
		{:else if loaded}
			<p class="empty">—</p>
		{:else}
			<p class="empty">…</p>
		{/if}
	</div>
</div>

<style>
	.layout {
		padding: 0;
	}

	.content {
		padding: var(--space-1) 0.5rem 0.5rem;
	}

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

	footer p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 2rem 0.5rem 1rem;
	}

	.empty {
		color: light-dark(var(--gray-10), var(--gray-9));
	}
</style>
