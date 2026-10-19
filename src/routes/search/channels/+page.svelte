<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {SearchUrl} from '#lib/search-url.svelte.js'
	import {searchChannelsCombined} from '#lib/search.js'
	import {viewFromUrl, viewLabel, viewToUrl} from '#lib/views.js'
	import {channelsCollection} from '#lib/collections/channels.js'
	import {tagsCollection} from '#lib/collections/tags.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {getFeaturedSuggestions} from '#lib/featured-suggestions.svelte.js'
	import {
		getTopChannelSlugs,
		paginationFromUrl,
		seededRandom,
		shuffleArray,
		shuffleSeed
	} from '#lib/utils.js'
	import ChannelCard from '#lib/components/channel-card.svelte'
	import SearchShell from '#lib/components/search-shell.svelte'
	import Pagination from '#lib/components/pagination.svelte'
	import PopoverMenu from '#lib/components/popover-menu.svelte'
	import SortControls from '#lib/components/sort-controls.svelte'
	import TagsFilterDialog from '#lib/components/tags-filter-dialog.svelte'
	import FilterChips from '#lib/components/filter-chips.svelte'
	import Icon from '#lib/components/icon.svelte'
	import {viewIconMap, viewLabelMap} from '#lib/components/channels-view-shared.js'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import Seo from '#lib/components/seo.svelte'
	import {trap} from '#lib/focus.js'
	import {fromAction} from 'svelte/attachments'
	import * as m from '#lib/paraglide/messages.js'

	const uid = $props.id()
	const search = new SearchUrl('/search/channels')

	let display = $state('list')
	let order = $state('updated')
	let direction = $state('desc')
	let shuffleSeedValue = $state(shuffleSeed())

	const sortedChannels = $derived.by(() => {
		if (order === 'shuffle') return shuffleArray(channels, seededRandom(shuffleSeedValue))
		const dir = direction === 'asc' ? 1 : -1
		return channels.toSorted((a, b) => {
			if (order === 'name') return dir * a.name.localeCompare(b.name)
			if (order === 'tracks') return dir * ((a.track_count ?? 0) - (b.track_count ?? 0))
			const key = order === 'created' ? 'created_at' : 'updated_at'
			return dir * (a[key] ?? '').localeCompare(b[key] ?? '')
		})
	})

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	// Channels have no tags column, but a "#tag" query still reads as a plausible
	// word to search their name/slug/description for — fold it into the text query
	// instead of dropping it (a pure #tag search should still find channels).
	const channelQuery = $derived([...(q.tags ?? []), q.search].filter(Boolean).join(' '))
	const hasFilter = $derived(!!q.channels?.length || !!channelQuery)
	const suggestions = getFeaturedSuggestions()
	const featuredChannelSlugs = $derived(getTopChannelSlugs(suggestions.pool, 6))

	// Same tag-filter dialog as the channel tracks page / other search pages. Channels
	// have no tags of their own, so the browsable list is the sitewide tag universe
	// rather than tags aggregated from the current result set.
	const selectedTags = $derived(q.tags ?? [])
	let showFiltersModal = $state(false)
	const activeFilterCount = $derived(selectedTags.length + (q.search ? 1 : 0))
	const tagsQuery = useLiveQuery(tagsCollection)
	const availableTags = $derived(
		(tagsQuery.data ?? []).map((t) => ({value: t.tag, count: t.count}))
	)

	function onViewsBarChange(v) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl('/search/channels', v), {replace: true})
	}

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

	const paginationState = $derived(paginationFromUrl(page.url))
	const currentPage = $derived(paginationState.page)
	const pageSize = $derived(paginationState.per)

	/** @type {import('#lib/types.ts').Channel[]} */
	let channels = $state([])
	let totalCount = $state(0)
	let channelsLoading = $state(false)
	const resultCount = $derived(totalCount || channels.length)

	$effect(() => {
		if (!hasFilter) {
			channels = []
			totalCount = 0
			return
		}
		channelsLoading = true
		let stale = false
		searchChannelsCombined({
			slugs: q.channels,
			query: channelQuery,
			localChannels: [...channelsCollection.state.values()],
			limit: pageSize,
			offset: (currentPage - 1) * pageSize
		})
			.then((result) => {
				if (!stale) {
					channels = result.channels
					totalCount = result.count
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

<Seo title={m.search_title()} plain />

<article {@attach fromAction(trap)}>
	<SearchShell {uid} bind:value={search.value} onsubmit={search.handleSubmit}>
		{#snippet filterToggle()}
			<button
				type="button"
				class="filter-toggle"
				title={m.views_filters_label()}
				onclick={() => (showFiltersModal = true)}
			>
				<Icon icon="hashtag" />
				{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
			</button>
			{#if hasFilter && channels.length}
				<PopoverMenu
					id="{uid}-channels-display"
					closeOnClick={false}
					triggerAttachment={tooltip({
						content: m.channels_view_mode({mode: viewLabelMap[display]()})
					})}
				>
					{#snippet trigger()}<Icon icon={viewIconMap[display]} strokeWidth={1.7} />{/snippet}
					<menu class="view-modes">
						<button
							class:active={display === 'grid'}
							onclick={() => (display = 'grid')}
							{@attach tooltip({content: m.channels_tooltip_grid()})}
							><Icon icon="grid" strokeWidth={1.7} /><small>{m.channels_view_label_grid()}</small
							></button
						>
						<button
							class:active={display === 'list'}
							onclick={() => (display = 'list')}
							{@attach tooltip({content: m.channels_tooltip_list()})}
							><Icon icon="unordered-list" /><small>{m.channels_view_label_list()}</small></button
						>
					</menu>
					<SortControls
						bind:order
						bind:direction
						onreshuffle={() => (shuffleSeedValue = shuffleSeed())}
					/>
				</PopoverMenu>
			{/if}
		{/snippet}
		{#snippet pagination()}
			<Pagination {currentPage} {pageSize} {totalCount} defaultPageSize={50} />
		{/snippet}
	</SearchShell>

	<TagsFilterDialog
		bind:showModal={showFiltersModal}
		tags={availableTags}
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

	{#if selectedTags.length}
		<FilterChips tags={selectedTags} onRemoveTag={toggleTag} />
	{/if}

	{#if hasFilter}
		{#if channelsLoading}
			<p>{m.search_loading_channels()}</p>
		{:else if channels.length}
			<section class="channel-results">
				<header>
					<h2>
						{resultCount === 1
							? m.search_channel_one({count: resultCount})
							: m.search_channel_other({count: resultCount})}
					</h2>
				</header>
				<ul class={display}>
					{#each sortedChannels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ul>
			</section>
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
				<a href={resolve('channels/all')}>All {m.explore_tab_channels()}</a>
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

	.channel-results > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-inline: 0.5rem;
	}

	.channel-results {
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
