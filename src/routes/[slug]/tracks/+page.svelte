<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {eq} from '@tanstack/db'
	import {parseUrl} from 'media-now'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Dialog from '$lib/components/dialog.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist} from '$lib/api'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {getChannelTags, seededRandom, shuffleSeed} from '$lib/utils'
	import {processViewTracks, getAutoDecksForView} from '$lib/views.svelte'
	import type {Track} from '$lib/types'
	import type {View} from '$lib/views'
	import * as m from '$lib/paraglide/messages'

	const viewOrderValues = ['shuffle', 'updated', 'created', 'name', 'tracks'] as const
	const viewDirectionValues = ['asc', 'desc'] as const

	function readViewOrder(value: string | null): View['order'] {
		return viewOrderValues.includes((value ?? '') as (typeof viewOrderValues)[number])
			? (value as View['order'])
			: 'created'
	}

	function readViewDirection(value: string | null): View['direction'] {
		return viewDirectionValues.includes((value ?? '') as (typeof viewDirectionValues)[number])
			? (value as View['direction'])
			: 'desc'
	}

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()

	let searchInput = $state(page.url.searchParams.get('q') ?? '')
	let selectedTags = $derived(page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? [])
	let searchValue = $derived(page.url.searchParams.get('q') ?? '')
	let matchingSlug = $derived((page.url.searchParams.get('matching') ?? '').trim().toLowerCase())
	let urlOrder = $derived(readViewOrder(page.url.searchParams.get('order')))
	let urlDirection = $derived(readViewDirection(page.url.searchParams.get('direction')))
	let urlSeed = $derived((page.url.searchParams.get('seed') ?? '').trim())
	let order = $state<View['order']>('created')
	let direction = $state<View['direction']>('desc')
	let randomSeed = $state('')
	let reshuffleKey = $state(0)
	let tagsSearch = $state('')
	let tagsSort = $state<'count' | 'alpha'>('count')
	let tagsDirection = $state<'asc' | 'desc'>('desc')
	let showFiltersModal = $state(false)
	const tagsSortOptions = [
		{value: 'count' as const, icon: 'hash' as const, label: () => m.tags_sort_count()},
		{value: 'alpha' as const, icon: 'sort' as const, label: () => m.tags_sort_alpha()}
	]

	function getCanonicalUrlKey(track: Track): string | null {
		let parsed = {} as {provider?: string; media_id?: string; mediaId?: string}
		try {
			parsed = (parseUrl(track.url || '') || {}) as {
				provider?: string
				media_id?: string
				mediaId?: string
			}
		} catch {
			parsed = {}
		}
		const provider = track.provider || parsed.provider
		const mediaId = track.media_id || parsed.media_id || parsed.mediaId
		if (provider && mediaId) return `${provider}:${mediaId}`
		const url = track.url?.trim().toLowerCase()
		return url || null
	}

	// Sync search input → URL (debounced by SearchInput)
	$effect(() => {
		const trimmed = searchInput.trim()
		if (trimmed === searchValue) return
		const url = new URL(page.url)
		if (trimmed) {
			url.searchParams.set('q', trimmed)
		} else {
			url.searchParams.delete('q')
		}
		goto(url, {replaceState: true})
	})

	$effect(() => {
		order = urlOrder
		direction = urlDirection
		randomSeed = urlSeed
	})

	$effect(() => {
		if (order === 'shuffle' && !randomSeed) randomSeed = shuffleSeed()
	})

	$effect(() => {
		const currentOrder = page.url.searchParams.get('order') ?? ''
		const currentDirection = page.url.searchParams.get('direction') ?? ''
		const currentSeed = page.url.searchParams.get('seed') ?? ''
		const nextOrder = order !== 'created' ? order : ''
		const nextDirection = direction !== 'desc' ? direction : ''
		const nextSeed = order === 'shuffle' ? randomSeed.trim() : ''
		if (
			currentOrder === nextOrder &&
			currentDirection === nextDirection &&
			currentSeed === nextSeed
		)
			return
		const url = new URL(page.url)
		if (nextOrder) url.searchParams.set('order', nextOrder)
		else url.searchParams.delete('order')
		if (nextDirection) url.searchParams.set('direction', nextDirection)
		else url.searchParams.delete('direction')
		if (nextSeed) url.searchParams.set('seed', nextSeed)
		else url.searchParams.delete('seed')
		goto(url, {replaceState: true, noScroll: true})
	})

	let slug = $derived(page.params.slug)
	let channel = $derived(channelCtx.data)
	const matchingTracksQuery = useLiveQuery(
		(q) =>
			matchingSlug
				? q
						.from({tracks: tracksCollection})
						.where(({tracks}) => eq(tracks.slug, matchingSlug))
						.orderBy(({tracks}) => tracks.created_at, 'desc')
				: null,
		[() => matchingSlug]
	)
	let matchingTracks = $derived((matchingTracksQuery.data ?? []) as Track[])
	let matchingTrackKeys = $derived.by(
		() => new Set(matchingTracks.map(getCanonicalUrlKey).filter((v): v is string => Boolean(v)))
	)
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let aggregatedTags = $derived(getChannelTags(allTracks))
	let isSorting = $derived(order !== 'created' || direction !== 'desc')
	let isFiltering = $derived(
		searchValue !== '' || selectedTags.length > 0 || isSorting || Boolean(matchingSlug)
	)
	let activeFilterCount = $derived(
		selectedTags.length + (searchValue ? 1 : 0) + (isSorting ? 1 : 0) + (matchingSlug ? 1 : 0)
	)
	let selectedTagsSort = $derived(
		tagsSortOptions.find((option) => option.value === tagsSort) ?? tagsSortOptions[0]
	)
	let visibleTags = $derived.by(() => {
		const q = tagsSearch.trim().toLowerCase()
		const filtered = aggregatedTags.filter((tag) => !q || tag.value.includes(q))
		const direction = tagsDirection === 'asc' ? 1 : -1
		return filtered.toSorted((a, b) => {
			const base =
				tagsSort === 'alpha'
					? a.value.localeCompare(b.value)
					: a.count - b.count || a.value.localeCompare(b.value)
			return base * direction
		})
	})
	let filteredTracks = $derived(
		(() => {
			// Force recomputation when user explicitly reshuffles.
			if (order === 'shuffle') void reshuffleKey
			return processViewTracks(
				allTracks,
				{
					sources: [
						{
							tags: selectedTags.length ? selectedTags : undefined,
							tagsMode: 'all',
							search: searchValue || undefined
						}
					],
					order: isSorting ? order : undefined,
					direction: isSorting ? direction : undefined
				},
				order === 'shuffle' ? {shuffleRand: seededRandom(randomSeed || 'default-seed')} : undefined
			)
		})()
	)
	let baseVisibleTracks = $derived(isFiltering ? filteredTracks : allTracks)
	let visibleTracks = $derived.by(() => {
		if (!matchingSlug) return baseVisibleTracks
		if (matchingSlug === slug) return baseVisibleTracks
		if (matchingTrackKeys.size === 0) return []
		return baseVisibleTracks.filter((track) => {
			const key = getCanonicalUrlKey(track)
			return Boolean(key && matchingTrackKeys.has(key))
		})
	})
	let hasActionableSelection = $derived(isFiltering && visibleTracks.length > 0)
	let filteredAutoRadioTracks = $derived(toAutoTracks(visibleTracks))
	let canShowFilteredAutoRadio = $derived(hasAutoRadioCoverage(visibleTracks))
	let filteredAutoView: View = $derived.by(() => ({
		sources: [
			{
				channels: slug ? [slug] : undefined,
				tags: selectedTags.length ? selectedTags : undefined,
				search: searchValue.trim() || undefined
			}
		]
	}))
	let filteredAutoDecks = $derived.by(() =>
		getAutoDecksForView(Object.values(appState.decks), filteredAutoView)
	)
	let isFilteredAutoActive = $derived(filteredAutoDecks.length > 0)
	let isFilteredAutoPlaying = $derived(filteredAutoDecks.some((d) => d.is_playing))
	let isFilteredAutoDrifted = $derived(filteredAutoDecks.some((d) => d.auto_radio_drifted))
	let targetTrackId = $derived.by(() => {
		const hash = decodeURIComponent(page.url.hash.replace(/^#/, ''))
		if (!hash) return null
		return hash.startsWith('track-') ? hash.slice('track-'.length) : hash
	})
	let targetTrackElementId = $derived(targetTrackId ? `track-${targetTrackId}` : null)
	let scrolledTrackElementId = $state<string | null>(null)
	let filteredPlaylistTitle = $derived.by(() => {
		const search = searchValue.trim()
		if (search) return search
		if (selectedTags.length) return selectedTags.map((tag) => `#${tag}`).join(' ')
		if (matchingSlug) return `@${matchingSlug}`
		return ''
	})

	$effect(() => {
		if (!matchingSlug || matchingSlug === slug) return
		void ensureTracksLoaded(matchingSlug)
	})

	$effect(() => {
		const elementId = targetTrackElementId
		if (!elementId || !tracksQuery.isReady || !visibleTracks.length) return
		if (scrolledTrackElementId === elementId) return
		if (!visibleTracks.some((track) => track.id === targetTrackId)) return

		const target = document.getElementById(elementId)
		if (!target) return

		scrolledTrackElementId = elementId
		requestAnimationFrame(() => {
			target.scrollIntoView({block: 'center'})
		})
	})

	function toggleTag(tag: string) {
		const normalized = tag.toLowerCase().trim()
		const next = selectedTags.some((t) => t.toLowerCase() === normalized)
			? selectedTags.filter((t) => t.toLowerCase() !== normalized)
			: [...selectedTags, normalized]
		const url = new URL(page.url)
		if (next.length) {
			url.searchParams.set('tags', next.join(','))
		} else {
			url.searchParams.delete('tags')
		}
		goto(url, {replaceState: true})
	}

	function clearMatchingFilter() {
		const url = new URL(page.url)
		url.searchParams.delete('matching')
		goto(url, {replaceState: true})
	}

	function playFilteredTracks() {
		if (!hasActionableSelection) return
		const ids = visibleTracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: filteredPlaylistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!hasActionableSelection) return
		addToPlaylist(
			appState.active_deck_id,
			visibleTracks.map((t) => t.id)
		)
	}

	function clearTrackFilters() {
		order = 'created'
		direction = 'desc'
		randomSeed = ''
		const url = new URL(page.url)
		url.searchParams.delete('tags')
		url.searchParams.delete('q')
		url.searchParams.delete('matching')
		url.searchParams.delete('order')
		url.searchParams.delete('direction')
		url.searchParams.delete('seed')
		goto(url, {replaceState: true})
	}

	function handleReshuffle() {
		if (order !== 'shuffle') order = 'shuffle'
		randomSeed = shuffleSeed()
		reshuffleKey += 1
	}
</script>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if allTracks.length}
		<button
			type="button"
			class="filter-toggle"
			title={m.views_filters_label()}
			onclick={() => (showFiltersModal = true)}
		>
			<Icon icon="hashtag" />
			{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
		</button>
		<SearchInput
			bind:value={searchInput}
			placeholder={`${visibleTracks.length}/${allTracks.length}`}
			debounce={150}
			autofocus={page.state.focus === true}
		/>
		<PopoverMenu closeOnClick={false} style="margin-left: auto;">
			{#snippet trigger()}
				<Icon
					icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'}
					strokeWidth={1.5}
				/>
			{/snippet}
			<SortControls bind:order bind:direction onreshuffle={handleReshuffle} />
		</PopoverMenu>
		{#if hasActionableSelection}
			<button type="button" title={m.common_play()} onclick={playFilteredTracks}
				><Icon icon="play-fill" /></button
			>
			<button type="button" title={m.common_queue()} onclick={queueFilteredTracks}
				><Icon icon="next-fill" /></button
			>
			{#if channel && canShowFilteredAutoRadio}
				<AutoRadioButton
					synced={isFilteredAutoActive && isFilteredAutoPlaying && !isFilteredAutoDrifted}
					title={isFilteredAutoDrifted ? m.auto_radio_resync() : m.tracks_auto_radio_selection()}
					onclick={() =>
						joinAutoRadio(appState.active_deck_id, filteredAutoRadioTracks, filteredAutoView)}
				/>
			{/if}
		{/if}
	{/if}
{/snippet}

{#if showFiltersModal}
	<Dialog bind:showModal={showFiltersModal}>
		{#snippet header()}
			<header class="modal-header">
				<h2>Tags filter</h2>
				{#if activeFilterCount > 0}
					<div class="modal-header-actions">
						<button type="button" class="ghost" onclick={clearTrackFilters}>
							{m.common_clear()}
						</button>
					</div>
				{/if}
			</header>
		{/snippet}
		<section class="filters-dialog">
			<p class="filters-stats">
				<strong>{visibleTracks.length}</strong> / {allTracks.length}
				{m.nav_tracks()}
			</p>
			{#if activeFilterCount > 0}
				<menu class="row filter-tags">
					{#if searchValue}
						<li><span class="chip">"{searchValue}"</span></li>
					{/if}
					{#if matchingSlug}
						<li>
							<button type="button" class="chip" onclick={clearMatchingFilter}
								>@{matchingSlug} ×</button
							>
						</li>
					{/if}
					{#each selectedTags as tag (tag)}
						<li>
							<button type="button" class="chip" onclick={() => toggleTag(tag)}>{tag} ×</button>
						</li>
					{/each}
				</menu>
			{/if}
			<section class="filters-dialog-panel">
				<h3>{m.views_tags_label()}</h3>
				<div class="tags-toolbar">
					<div class="tags-search-row">
						<input type="search" bind:value={tagsSearch} placeholder="Search tags" />
						<PopoverMenu>
							{#snippet trigger()}
								<Icon icon={selectedTagsSort.icon} />
								{selectedTagsSort.label()}
							{/snippet}
							<menu class="tags-sort-options nav-vertical">
								{#each tagsSortOptions as option (option.value)}
									<button
										type="button"
										class:active={tagsSort === option.value}
										onclick={() => (tagsSort = option.value)}
										title={option.label()}
									>
										<Icon icon={option.icon} />
										{option.label()}
									</button>
								{/each}
							</menu>
						</PopoverMenu>
						<button
							type="button"
							class="ghost"
							title={tagsDirection === 'asc'
								? m.channels_tooltip_sort_asc()
								: m.channels_tooltip_sort_desc()}
							onclick={() => (tagsDirection = tagsDirection === 'asc' ? 'desc' : 'asc')}
						>
							<Icon icon={tagsDirection === 'asc' ? 'funnel-ascending' : 'funnel-descending'} />
						</button>
					</div>
				</div>
				<menu class="tags-menu">
					{#each visibleTags as { value, count } (value)}
						<button
							type="button"
							class:active={selectedTags.includes(value)}
							onclick={() => toggleTag(value)}
						>
							#{value} <span class="tag-count">({count})</span>
						</button>
					{/each}
				</menu>
			</section>
		</section>
	</Dialog>
{/if}

{#if channel}
	<Subpage
		title={m.nav_tracks()}
		loading={tracksQuery.isLoading && allTracks.length === 0}
		empty={tracksQuery.isReady && allTracks.length === 0}
	>
		{#snippet emptyChildren()}
			<p>{m.channel_no_tracks()}</p>
		{/snippet}
		<section>
			<header>
				{#if isFiltering && (selectedTags.length > 0 || matchingSlug)}
					<menu class="row filter-tags">
						{#if matchingSlug}
							<button type="button" class="chip" onclick={clearMatchingFilter}
								>@{matchingSlug} ×</button
							>
						{/if}
						{#each selectedTags as tag (tag)}
							<button type="button" class="chip" onclick={() => toggleTag(tag)}>
								{tag} ×
							</button>
						{/each}
					</menu>
				{/if}
			</header>

			{#if tracksQuery.isReady && visibleTracks.length > 0}
				<Tracklist
					tracks={visibleTracks}
					playlistTitle={isFiltering ? filteredPlaylistTitle : undefined}
					{canEdit}
					grouped={!isFiltering}
					virtual={false}
					playContext={true}
					selectedTrackId={targetTrackId}
					onTagClick={toggleTag}
				/>
			{/if}

			<footer>
				{#if isFiltering && tracksQuery.isReady && visibleTracks.length === 0}
					<p class="empty">{m.tracks_empty_filter()}</p>
				{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
					<p class="empty">{m.channel_loading_tracks()}</p>
				{/if}
			</footer>
		</section>
	</Subpage>
{/if}

<style>
	header {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.filter-toggle {
		font-size: var(--font-3);
	}

	.filters-dialog {
		display: grid;
		gap: 0.75rem;
	}

	.filters-stats {
		margin: 0;
	}

	.filters-dialog-panel {
		display: grid;
		gap: 0.35rem;
		h3 {
			margin: 0;
		}
	}

	.tags-menu {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		max-height: min(32vh, 20rem);
		overflow: auto;
		button.active {
			background: var(--accent-5);
			color: var(--accent-11);
		}
	}

	.tags-toolbar {
		display: grid;
		gap: 0.35rem;
	}

	.tags-search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.35rem;
	}

	.tags-sort-options {
		min-width: 10rem;
	}

	.tags-sort-options button {
		justify-content: flex-start;
	}

	.tag-count {
		opacity: 0.6;
		font-size: 0.85em;
	}

	.filter-tags {
		flex-wrap: wrap;
		gap: 0.35rem;
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
		gap: 0.35rem;
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
