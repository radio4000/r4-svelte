<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import {queryView} from '$lib/views.svelte'
	import {serializeView, viewFromUrl, viewLabel, viewToUrl} from '$lib/views'
	import SearchShell from '$lib/components/search-shell.svelte'
	import SearchTrackMenu from '$lib/components/search-track-menu.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import {playTrack, setPlaylist, loadDeckView} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import Pagination from '$lib/components/pagination.svelte'
	import {getTopChannelSlugs, getTopTagValues} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()
	const search = new SearchUrl('/search/tracks')

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	const currentPage = $derived(Math.max(1, parseInt(page.url.searchParams.get('page') ?? '1') || 1))
	const pageSize = $derived(Math.max(1, parseInt(page.url.searchParams.get('per') ?? '50') || 50))

	function onViewsBarChange(v) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl('/search/tracks', v), {replaceState: true})
	}

	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const totalCount = $derived(viewQuery.count)
	const tracksLoading = $derived(viewQuery.loading)
	const featuredChannelSlugs = $derived(getTopChannelSlugs(channelsCollection.state.values(), 6))
	const featuredTags = $derived(getTopTagValues([...tracksCollection.state.values()], 12))
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
		{#if !tracksLoading && tracks.length === 0}
			<p>{m.search_no_results()} "{search.value || serializeView(view)}"</p>
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
					<SearchTrackMenu {tracks} title={search.value.trim()} {view} basePath="/search/tracks" />
				</header>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li class="track-with-channel">
							<TrackCard
								{track}
								{index}
								onPlay={(trackId) => {
									const ids = tracks.map((t) => t.id)
									if (view)
										loadDeckView(appState.active_deck_id, view, ids, {title: search.value.trim()})
									else setPlaylist(appState.active_deck_id, ids, {title: search.value.trim()})
									playTrack(appState.active_deck_id, trackId, null, 'play_search')
								}}
							/>
							<ChannelMicroCard slug={track.slug} />
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
						<a href={resolve('/search/tracks') + `?q=${encodeURIComponent('@' + slug)}`}>@{slug}</a>
					{/each}
					{#each featuredTags as tag (`tag-${tag}`)}
						<a href={resolve('/search/tracks') + `?q=${encodeURIComponent('#' + tag)}`}>#{tag}</a>
					{/each}
				</p>
			{/if}
			<p class="browse-links">
				<a href={resolve('/tracks/recent')}>All {m.explore_tab_tracks()}</a>
			</p>
		</div>
	{/if}
</article>

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

	article {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	article > p {
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

	.featured-tags,
	.browse-links {
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
</style>
