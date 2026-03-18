<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import {tracksCollection, fetchRecentTracks} from '$lib/collections/tracks'
	import {loadFeaturedChannelTracks} from '$lib/collections/featured'
	import {groupByDay} from '$lib/utils'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const {data} = $props()

	let search = $state('')
	$effect(() => {
		const q = search.trim()
		if (!q) return
		goto(`/search/tracks?q=${encodeURIComponent(q)}`, {replaceState: true})
	})

	const LIMIT = 50
	const FEATURED_DAYS = 30
	const FEATURED_COUNT = 3

	let tracks = $state(/** @type {import('$lib/types').Track[]} */ ([]))
	let loadedAll = $state(false)
	let loadingMore = $state(false)
	let loaded = $state(false)
	let currentOffset = $state(0)

	const filterParam = $derived(data.filter)

	$effect(() => {
		const f = filterParam
		tracks = []
		loadedAll = false
		loaded = false
		currentOffset = 0
		loadData(f)
	})

	async function loadData(filter) {
		loadingMore = true
		try {
			if (filter === 'recent') {
				const result = await fetchRecentTracks({limit: LIMIT, offset: 0})
				tracks = result
				loadedAll = result.length < LIMIT
				currentOffset = LIMIT
			} else {
				await loadFeatured()
			}
			loaded = true
		} finally {
			loadingMore = false
		}
	}

	async function loadFeatured() {
		const picked = await loadFeaturedChannelTracks(FEATURED_COUNT, FEATURED_DAYS)
		const featuredSince = new Date(Date.now() - FEATURED_DAYS * 86400000).toISOString()
		const slugSet = new Set(picked.map((ch) => ch.slug))
		// Access .size so this derived re-runs when tracks are upserted into the collection
		void tracksCollection.state.size
		tracks = [...tracksCollection.state.values()]
			.filter((t) => t?.slug && slugSet.has(t.slug) && (t.created_at ?? '') >= featuredSince)
			.toSorted((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
			.slice(0, 50)
		loadedAll = true
	}

	async function handleLoadMore() {
		if (filterParam !== 'recent' || loadedAll) return
		loadingMore = true
		try {
			const result = await fetchRecentTracks({limit: LIMIT, offset: currentOffset})
			tracks = [...tracks, ...result]
			currentOffset += LIMIT
			loadedAll = result.length < LIMIT
		} finally {
			loadingMore = false
		}
	}

	const groupedTracks = $derived(groupByDay(tracks))
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<div class="layout">
	<menu class="filtermenu">
		<ExploreSectionMenu />

		<PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}
				<Icon icon="filter-alt" />
				{filterParam === 'recent' ? m.explore_tracks_filter_recent() : m.explore_tracks_filter_featured()}
			{/snippet}
			<menu class="nav-vertical">
				<button class:active={filterParam === 'recent'} onclick={() => goto(resolve('/tracks/recent'))}
					>{m.explore_tracks_filter_recent()}</button
				>
				<button class:active={filterParam === 'featured'} onclick={() => goto(resolve('/tracks/featured'))}
					>{m.explore_tracks_filter_featured()}</button
				>
			</menu>
		</PopoverMenu>

		<SearchInput bind:value={search} debounce={300} placeholder={m.search_placeholder()} />
	</menu>

	{#if groupedTracks.length}
		{#each groupedTracks as group (group.label)}
			<p class="day-header">{group.label}</p>
			<ul class="list">
				{#each group.tracks as track (track.id)}
					<li><TrackCard {track} showSlug={true} /></li>
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

<style>
	.layout {
		padding: 0.5rem;
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		z-index: 1;
	}

	.filtermenu :global(.search-input) {
		flex: 1 1 0;
		min-width: 6rem;
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
