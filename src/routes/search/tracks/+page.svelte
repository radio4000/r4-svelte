<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {SearchUrl} from '#lib/search-url.svelte.js'
	import {queryView} from '#lib/views.svelte.js'
	import {serializeView, viewFromUrl, viewLabel, viewToUrl} from '#lib/views.js'
	import SearchShell from '#lib/components/search-shell.svelte'
	import SearchTrackMenu from '#lib/components/search-track-menu.svelte'
	import FilterChips from '#lib/components/filter-chips.svelte'
	import TagsFilterDialog from '#lib/components/tags-filter-dialog.svelte'
	import ChannelsFilterDialog from '#lib/components/channels-filter-dialog.svelte'
	import Icon from '#lib/components/icon.svelte'
	import TrackCard from '#lib/components/track-card.svelte'
	import ChannelMicroCard from '#lib/components/channel-micro-card.svelte'
	import {playTrack, setPlaylist, loadDeckView} from '#lib/api.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {getFeaturedSuggestions} from '#lib/featured-suggestions.svelte.js'
	import {trap} from '#lib/focus.js'
	import {fromAction} from 'svelte/attachments'
	import Pagination from '#lib/components/pagination.svelte'
	import Seo from '#lib/components/seo.svelte'
	import {getChannelTags, getTopChannelSlugs, paginationFromUrl} from '#lib/utils.js'
	import * as m from '#lib/paraglide/messages.js'

	const uid = $props.id()
	const search = new SearchUrl('/search/tracks')

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	const pagination = $derived(paginationFromUrl(page.url))
	const currentPage = $derived(pagination.page)
	const pageSize = $derived(pagination.per)

	function onViewsBarChange(v) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl('/search/tracks', v), {replace: true})
	}

	// Same tag-filter dialog as the channel tracks page — tags are aggregated
	// from the current result set rather than a whole channel's tracks.
	const selectedTags = $derived(q.tags ?? [])
	let showFiltersModal = $state(false)
	const activeFilterCount = $derived(selectedTags.length + (q.search ? 1 : 0))

	function toggleTag(tag) {
		const normalized = tag.toLowerCase().trim()
		const current = q.tags ?? []
		const nextTags = current.some((t) => t.toLowerCase() === normalized)
			? current.filter((t) => t.toLowerCase() !== normalized)
			: [...current, normalized]
		onViewsBarChange({
			...view,
			sources: [
				{
					...q,
					tags: nextTags.length ? nextTags : undefined,
					tagsMode: nextTags.length ? 'all' : undefined
				}
			]
		})
	}

	function clearTags() {
		onViewsBarChange({...view, sources: [{...q, tags: undefined, tagsMode: undefined}]})
	}

	// Same dialog pattern as tags, for @channel filtering — browsable list is the
	// featured-channels pool (channels have no global "usage count" like tags).
	const selectedChannels = $derived(q.channels ?? [])
	let showChannelsModal = $state(false)
	const activeChannelCount = $derived(selectedChannels.length)

	function toggleChannel(slug) {
		const normalized = slug.toLowerCase().trim()
		const current = q.channels ?? []
		const nextChannels = current.some((c) => c.toLowerCase() === normalized)
			? current.filter((c) => c.toLowerCase() !== normalized)
			: [...current, normalized]
		onViewsBarChange({
			...view,
			sources: [{...q, channels: nextChannels.length ? nextChannels : undefined}]
		})
	}

	function clearChannels() {
		onViewsBarChange({...view, sources: [{...q, channels: undefined}]})
	}

	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const totalCount = $derived(viewQuery.count)
	const resultCount = $derived(totalCount || tracks.length)
	const tracksLoading = $derived(viewQuery.loading)
	const aggregatedTags = $derived(getChannelTags(tracks))
	const suggestions = getFeaturedSuggestions()
	const channelSuggestions = $derived(
		suggestions.pool
			.filter((c) => c.slug)
			.map((c) => ({slug: c.slug, name: c.name, count: c.track_count ?? 0}))
	)
	const featuredChannelSlugs = $derived(getTopChannelSlugs(suggestions.pool, 6))
	const featuredTags = $derived(suggestions.tags.slice(0, 12))
</script>

<Seo title={m.search_title()} plain />

<article {@attach fromAction(trap)}>
	<SearchShell
		{uid}
		bind:value={search.value}
		onsubmit={search.handleSubmit}
		{view}
		onviewchange={onViewsBarChange}
	>
		{#snippet filterToggle()}
			<button
				type="button"
				class="filter-toggle"
				title={m.views_channels_label()}
				onclick={() => (showChannelsModal = true)}
			>
				<Icon icon="at" />
				{activeChannelCount > 0 ? `(${activeChannelCount})` : ''}
			</button>
			<button
				type="button"
				class="filter-toggle"
				title={m.views_filters_label()}
				onclick={() => (showFiltersModal = true)}
			>
				<Icon icon="hashtag" />
				{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
			</button>
		{/snippet}
		{#snippet pagination()}
			<Pagination {currentPage} {pageSize} {totalCount} defaultPageSize={50} />
		{/snippet}
	</SearchShell>

	<ChannelsFilterDialog
		bind:showModal={showChannelsModal}
		channels={channelSuggestions}
		{selectedChannels}
		onToggleChannel={toggleChannel}
	>
		{#snippet dialogHeader()}
			<header class="modal-header">
				<h2>{m.views_channels_label()}</h2>
				{#if activeChannelCount > 0}
					<div class="modal-header-actions">
						<button type="button" class="ghost" onclick={clearChannels}>
							{m.common_clear()}
						</button>
					</div>
				{/if}
			</header>
		{/snippet}
		{#snippet dialogTop()}
			{#if selectedChannels.length}
				<FilterChips channels={selectedChannels} onRemoveChannel={toggleChannel} />
			{/if}
		{/snippet}
	</ChannelsFilterDialog>

	<TagsFilterDialog
		bind:showModal={showFiltersModal}
		tags={aggregatedTags}
		{selectedTags}
		onToggleTag={toggleTag}
	>
		{#snippet dialogHeader()}
			<header class="modal-header">
				<h2>{m.views_filters_label()}</h2>
				{#if activeFilterCount > 0}
					<div class="modal-header-actions">
						<button type="button" class="ghost" onclick={clearTags}>
							{m.common_clear()}
						</button>
					</div>
				{/if}
			</header>
		{/snippet}
		{#snippet dialogTop()}
			{#if selectedTags.length}
				<FilterChips tags={selectedTags} onRemoveTag={toggleTag} />
			{/if}
		{/snippet}
	</TagsFilterDialog>

	{#if selectedTags.length || selectedChannels.length}
		<FilterChips
			channels={selectedChannels}
			tags={selectedTags}
			onRemoveChannel={toggleChannel}
			onRemoveTag={toggleTag}
		/>
	{/if}

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
						{resultCount === 1
							? m.search_track_one({count: resultCount})
							: m.search_track_other({count: resultCount})}
					</h2>
					<SearchTrackMenu {tracks} title={search.value.trim()} {view} />
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
								onTagClick={toggleTag}
								{selectedTags}
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
				<a href={resolve('tracks/recent')}>All {m.explore_tab_tracks()}</a>
			</p>
		</div>
	{/if}
</article>

<style>
	.filter-toggle {
		font-size: var(--font-3);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.modal-header h2 {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
	}

	.modal-header-actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	article > :global(.filter-chips) {
		margin: var(--space-2) 0.5rem 0.5rem;
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

	article {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	/* The page header is sticky and always article's first child — give whatever
	   renders right after it (chips, empty state, results) room to breathe. */
	:global(.page-header) + * {
		margin-top: var(--space-2);
	}

	article > p {
		margin-inline: 0.5rem;
	}

	.track-results > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-inline: 0.5rem;
	}

	.track-results > header > :global(.search-track-menu) {
		margin-inline-start: auto;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
		margin-top: var(--space-2);
	}

	.featured-tags,
	.browse-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) 0.5rem;
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
