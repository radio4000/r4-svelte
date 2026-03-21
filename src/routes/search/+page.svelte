<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {setScene} from '$lib/scene-state.svelte'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import {queryView} from '$lib/views.svelte'
	import {serializeView, viewFromUrl, viewLabel, viewToUrl} from '$lib/views'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchShell from '$lib/components/search-shell.svelte'
	import SearchTrackMenu from '$lib/components/search-track-menu.svelte'
	import {searchChannelsCombined} from '$lib/search'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {getTopChannelSlugs, getTopTagValues} from '$lib/utils'
	import {resolve} from '$app/paths'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import * as m from '$lib/paraglide/messages'

	setScene({
		geometry: 'icosahedron',
		backgroundColor: 'oklch(10% 0.05 200)',
		cameraPosition: [0, 0, 5],
		rotationSpeed: 0.5
	})

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

	// Track results (View pipeline)
	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const tracksLoading = $derived(viewQuery.loading)

	const featuredChannelSlugs = $derived(getTopChannelSlugs(channelsCollection.state.values(), 3))
	const featuredTags = $derived(getTopTagValues([...tracksCollection.state.values()], 6))

	// --- Channel results (parallel, outside View) ---
	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		if (!hasFilter) {
			channels = []
			return
		}
		channelsLoading = true
		let stale = false
		searchChannelsCombined({
			slugs: q.channels,
			query: q.search,
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
