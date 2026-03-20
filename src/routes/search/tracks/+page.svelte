<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import {queryView} from '$lib/views.svelte'
	import {parseView, serializeView, viewFromUrl, viewLabel, viewToUrl} from '$lib/views'
	import SearchShell from '$lib/components/search-shell.svelte'
	import SearchTrackMenu from '$lib/components/search-track-menu.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import {getTopChannelSlugs, getTopTagValues} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()
	const search = new SearchUrl('/search/tracks', (q) => viewToUrl('/search/tracks', parseView(q)))

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	function onViewsBarChange(v) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl('/search/tracks', v), {replaceState: true})
	}

	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const tracksLoading = $derived(viewQuery.loading)
	const featuredChannelSlugs = $derived(getTopChannelSlugs(channelsCollection.state.values(), 6))
	const featuredTags = $derived(getTopTagValues([...tracksCollection.state.values()], 12))
</script>

<svelte:head>
	<title>{m.search_title()}</title>
</svelte:head>

<article {@attach fromAction(trap)}>
	<SearchShell {uid} bind:value={search.value} onsubmit={search.handleSubmit} {view} onviewchange={onViewsBarChange} />

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
						{tracks.length === 1
							? m.search_track_one({count: tracks.length})
							: m.search_track_other({count: tracks.length})}
					</h2>
					<SearchTrackMenu {tracks} title={search.value.trim()} {view} />
				</header>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li><TrackCard {track} {index} showSlug={true} /></li>
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
