<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import {searchChannelsCombined} from '$lib/search'
	import {viewFromUrl} from '$lib/views'
	import {channelsCollection} from '$lib/collections/channels'
	import {getTopChannelSlugs} from '$lib/utils'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchShell from '$lib/components/search-shell.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()
	const search = new SearchUrl('/search/channels')

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.search)
	const featuredChannelSlugs = $derived(getTopChannelSlugs(channelsCollection.state.values(), 6))

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
	<SearchShell {uid} bind:value={search.value} onsubmit={search.handleSubmit} />

	{#if hasFilter}
		{#if channelsLoading}
			<p>{m.search_loading_channels()}</p>
		{:else if channels.length}
			<ul class="list">
				{#each channels as channel (channel.id)}
					<li><ChannelCard {channel} /></li>
				{/each}
			</ul>
		{:else}
			<p>{m.search_no_results()} "{search.value}"</p>
		{/if}
	{:else}
		<div class="empty-tip">
			<p><small>{m.search_tip_slug()}</small></p>
			{#if featuredChannelSlugs.length}
				<p class="featured-tags">
					<small>{m.search_examples()}</small>
					{#each featuredChannelSlugs as slug (`channel-${slug}`)}
						<a href={resolve('/search/channels') + `?q=${encodeURIComponent('@' + slug)}`}
							>@{slug}</a
						>
					{/each}
				</p>
			{/if}
			<p class="browse-links">
				<a href={resolve('/channels/all')}>All {m.explore_tab_channels()}</a>
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
