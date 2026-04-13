<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import {queryView} from '$lib/views.svelte'
	import {serializeView, viewFromUrl, viewLabel, viewToUrl} from '$lib/views'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {playTrack, setPlaylist, loadDeckView} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import SearchShell from '$lib/components/search-shell.svelte'
	import SearchTrackMenu from '$lib/components/search-track-menu.svelte'
	import {searchChannelsCombined} from '$lib/search'
	import Pagination from '$lib/components/pagination.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {featuredScore, getTopTagValues, seededRandom, shuffleArray, shuffleSeed} from '$lib/utils'
	import {resolve} from '$app/paths'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()
	const search = new SearchUrl('/search')
	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	function onViewsBarChange(v) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl('/search', v), {replaceState: true})
	}

	const currentPage = $derived(Math.max(1, parseInt(page.url.searchParams.get('page') ?? '1') || 1))
	const pageSize = $derived(Math.max(1, parseInt(page.url.searchParams.get('per') ?? '50') || 50))
	const featuredSuggestionsSeed = shuffleSeed()

	// Track results (View pipeline)
	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const totalCount = $derived(viewQuery.count)
	const tracksLoading = $derived(viewQuery.loading)

	const featuredChannelPool = $derived.by(() =>
		[...channelsCollection.state.values()]
			.filter((c) => c?.slug && (c.track_count ?? 0) > 0)
			.toSorted((a, b) => featuredScore(b) - featuredScore(a))
			.slice(0, 120)
	)
	const featuredChannelSlugs = $derived.by(() =>
		shuffleArray(
			featuredChannelPool.map((c) => c.slug),
			seededRandom(`${featuredSuggestionsSeed}:channels`)
		).slice(0, 3)
	)
	const featuredTags = $derived.by(() => {
		const featuredSlugs = new Set(featuredChannelPool.slice(0, 40).map((channel) => channel.slug))
		const featuredTracks = [...tracksCollection.state.values()].filter(
			(track) => track?.slug && featuredSlugs.has(track.slug)
		)
		const tagPool = getTopTagValues(featuredTracks.length ? featuredTracks : [...tracksCollection.state.values()], 32)
		return shuffleArray(tagPool, seededRandom(`${featuredSuggestionsSeed}:tags`)).slice(0, 6)
	})

	// --- Channel results (parallel, outside View) ---
	// Stable keys so pagination (page/offset) changes don't re-trigger the channel search.
	const channelSlugsKey = $derived(q.channels?.join(',') || '')
	const searchTermKey = $derived(q.search || '')

	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		const slugs = channelSlugsKey ? channelSlugsKey.split(',') : undefined
		const query = searchTermKey || undefined
		if (!slugs?.length && !query) {
			channels = []
			return
		}
		channelsLoading = true
		let stale = false
		searchChannelsCombined({
			slugs,
			query,
			localChannels: [...channelsCollection.state.values()]
		})
			.then((results) => {
				if (!stale) {
					channels = results
					channelsLoading = false
				}
			})
			.catch(() => {
				if (!stale) channelsLoading = false
			})
		return () => {
			stale = true
		}
	})
</script>

<svelte:head>
	<title>{m.search_title()}</title>
</svelte:head>

<article {@attach fromAction(trap)}>
	<SearchShell
		{uid}
		bind:value={search.value}
		onsubmit={search.handleSubmit}
		{view}
		onviewchange={onViewsBarChange}
	/>

	{#if hasFilter}
		{#if !channelsLoading && !tracksLoading && channels.length === 0 && tracks.length === 0}
			<p>{m.search_no_results()} "{search.value || serializeView(view)}"</p>
			<p>{m.search_tip_slug()}</p>
		{/if}

		{#if channelsLoading}
			<p>{m.search_loading_channels()}</p>
		{:else if channels.length}
			<section>
				<h2>
					{channels.length === 1
						? m.search_channel_one({count: channels.length})
						: m.search_channel_other({count: channels.length})}
				</h2>
				<ul class={channels.length < 3 ? 'list' : 'grid grid--scroll'}>
					{#each channels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if tracksLoading}
			<p>{m.search_loading_tracks()}</p>
		{:else if tracks.length}
			<section class="track-results">
				<header>
					<h2>
						{totalCount || tracks.length}
						{tracks.length === 1
							? m.search_track_one({count: tracks.length})
							: m.search_track_other({count: tracks.length})}
					</h2>
					<Pagination {currentPage} {pageSize} {totalCount} defaultPageSize={50} />
					<SearchTrackMenu {tracks} title={search.value.trim()} {view} basePath="/search" />
				</header>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li>
							<TrackCard
								{track}
								{index}
								showSlug={true}
								onPlay={(trackId) => {
									const ids = tracks.map((t) => t.id)
									if (view)
										loadDeckView(appState.active_deck_id, view, ids, {title: search.value.trim()})
									else setPlaylist(appState.active_deck_id, ids, {title: search.value.trim()})
									playTrack(appState.active_deck_id, trackId, null, 'play_search')
								}}
							/>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<div class="empty-tip">
			<p><small>{m.search_tip_slug()}</small></p>
			{#if featuredChannelSlugs.length || featuredTags.length}
				<p class="featured-tags">
					<small>{m.search_examples()}</small>
					{#each featuredChannelSlugs as slug (`channel-${slug}`)}
						<a href={resolve('/search') + `?q=${encodeURIComponent('@' + slug)}`}>@{slug}</a>
					{/each}
					{#each featuredTags as tag (`tag-${tag}`)}
						<a href={resolve('/search/tracks') + `?q=${encodeURIComponent('#' + tag)}`}>#{tag}</a>
					{/each}
				</p>
			{/if}
			<p class="browse-links">
				<a href={resolve('/channels/all')}>All {m.explore_tab_channels()}</a>
				<a href={resolve('/tracks/recent')}>All {m.explore_tab_tracks()}</a>
			</p>
		</div>
	{/if}
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	article > p,
	section > h2 {
		margin-inline: 0.5rem;
	}

	.track-results > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-inline: 0.5rem;
	}

	section {
		margin-bottom: 1rem;
	}

	.empty-tip {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 0;
	}

	.featured-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		justify-content: center;
		color: light-dark(var(--gray-9), var(--gray-8));

		a {
			color: var(--accent-9);
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}

	.browse-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: center;

		a {
			color: var(--accent-9);
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}
</style>
