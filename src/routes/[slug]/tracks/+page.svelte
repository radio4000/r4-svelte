<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {getMatchingTracksQuery} from '../matching-tracks-query.svelte.ts'
	import {getTagFilter} from '../tag-filter.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import FilterChips from '$lib/components/filter-chips.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import TagsFilterDialog from '$lib/components/tags-filter-dialog.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import {addToPlaylist, ensureActiveDeck, joinAutoRadio, loadDeckView, playTrack} from '$lib/api'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {
		canonicalTrackKey,
		getChannelTags,
		HASH_PREFIX_REGEX,
		seededRandom,
		shuffleSeed
	} from '$lib/utils'
	import {processViewTracks, getAutoDecksForView} from '$lib/views.svelte'
	import {channelViewFromUrl, type View} from '$lib/views'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()

	const {toggleTag} = getTagFilter()
	// Single source of truth for the URL-backed filter (?tags=, ?q=, order/direction).
	let urlView = $derived(channelViewFromUrl(page.url, page.params.slug))
	let selectedTags = $derived(urlView.sources[0]?.tags ?? [])
	let searchValue = $derived(urlView.sources[0]?.search ?? '')
	let mention = $derived(urlView.sources[0]?.mention ?? '')
	let urlOrder = $derived(urlView.order ?? 'created')
	let urlDirection = $derived(urlView.direction ?? 'desc')
	let urlSeed = $derived((page.url.searchParams.get('seed') ?? '').trim())
	let order = $state<View['order']>('created')
	let direction = $state<View['direction']>('desc')
	let randomSeed = $state('')
	let reshuffleKey = $state(0)
	let showFiltersModal = $state(false)

	// SearchInput binds straight to the URL — no local mirror state to fall out of sync.
	// keepFocus is required: goto() resets focus to <body> on every navigation by default,
	// which was unfocusing the search box on every debounced keystroke.
	function setSearchValue(next: string) {
		const trimmed = next.trim()
		if (trimmed === searchValue) return
		const url = new URL(page.url)
		if (trimmed) url.searchParams.set('q', trimmed)
		else url.searchParams.delete('q')
		goto(url, {replaceState: true, keepFocus: true})
	}

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
	const matchingQuery = getMatchingTracksQuery(() => slug)
	let matchingSlug = $derived(matchingQuery.matchingSlug)
	let matchingTracks = $derived(matchingQuery.tracks)
	let matchingTrackKeys = $derived.by(
		() => new Set(matchingTracks.map(canonicalTrackKey).filter((v): v is string => Boolean(v)))
	)
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let isSorting = $derived(order !== 'created' || direction !== 'desc')
	let isFiltering = $derived(
		searchValue !== '' || selectedTags.length > 0 || isSorting || Boolean(matchingSlug || mention)
	)
	let activeFilterCount = $derived(
		selectedTags.length +
			(searchValue ? 1 : 0) +
			(isSorting ? 1 : 0) +
			(matchingSlug ? 1 : 0) +
			(mention ? 1 : 0)
	)
	let filteredTracks = $derived.by(() => {
		// Force recomputation when user explicitly reshuffles.
		if (order === 'shuffle') void reshuffleKey
		return processViewTracks(
			allTracks,
			{
				sources: urlView.sources,
				order: isSorting ? order : undefined,
				direction: isSorting ? direction : undefined
			},
			order === 'shuffle'
				? {shuffleRand: seededRandom(randomSeed || 'default-seed')}
				: // allTracks arrives created_at desc from the live query, so the default sort is a no-op
					{inputOrder: 'created-desc'}
		)
	})
	let baseVisibleTracks = $derived(isFiltering ? filteredTracks : allTracks)
	let visibleTracks = $derived.by(() => {
		if (!matchingSlug) return baseVisibleTracks
		if (matchingSlug === slug) return baseVisibleTracks
		if (matchingTrackKeys.size === 0) return []
		return baseVisibleTracks.filter((track) => {
			const key = canonicalTrackKey(track)
			return Boolean(key && matchingTrackKeys.has(key))
		})
	})
	// Narrows as filters are applied, so selecting a tag updates the tag list
	// (and its counts) to what's still reachable, instead of always showing
	// the channel's full, unfiltered tag cloud.
	let aggregatedTags = $derived(getChannelTags(visibleTracks))
	let hasActionableSelection = $derived(isFiltering && visibleTracks.length > 0)
	let filteredAutoRadioTracks = $derived(toAutoTracks(visibleTracks))
	let canShowFilteredAutoRadio = $derived(hasAutoRadioCoverage(visibleTracks))
	// Same sources as the filter above, so the deck's saved view (and its
	// tagsMode=all) matches exactly what this page showed.
	let filteredAutoView: View = $derived.by(() => ({sources: urlView.sources}))
	let filteredAutoDecks = $derived.by(() =>
		getAutoDecksForView(Object.values(appState.decks), filteredAutoView)
	)
	let isFilteredAutoActive = $derived(filteredAutoDecks.length > 0)
	let isFilteredAutoPlaying = $derived(filteredAutoDecks.some((d) => d.is_playing))
	let isFilteredAutoDrifted = $derived(filteredAutoDecks.some((d) => d.auto_radio_drifted))
	let targetTrackId = $derived.by(() => {
		const hash = decodeURIComponent(page.url.hash.replace(HASH_PREFIX_REGEX, ''))
		if (!hash) return null
		return hash.startsWith('track-') ? hash.slice('track-'.length) : hash
	})
	let targetTrackElementId = $derived(targetTrackId ? `track-${targetTrackId}` : null)
	let scrolledTrackElementId = $state<string | null>(null)
	let filteredPlaylistTitle = $derived.by(() => {
		const search = searchValue.trim()
		if (mention) return `@${slug} mention: @${mention}`
		if (search) return search
		if (selectedTags.length) return selectedTags.map((tag) => `#${tag}`).join(' ')
		if (matchingSlug) return `@${matchingSlug}`
		return ''
	})

	$effect(() => {
		const trackId = targetTrackId
		const elementId = targetTrackElementId
		if (!trackId || !elementId || !tracksQuery.isReady || !visibleTracks.length) return
		if (scrolledTrackElementId === elementId) return
		if (!visibleTracks.some((track) => track.id === trackId)) return

		scrolledTrackElementId = elementId
		requestAnimationFrame(() => {
			document.getElementById(elementId)?.scrollIntoView({block: 'center'})
		})
	})

	function clearMentionFilter() {
		const url = new URL(page.url)
		url.searchParams.delete('mention')
		goto(url, {noScroll: true, keepFocus: true})
	}

	function clearMatchingFilter() {
		const url = new URL(page.url)
		url.searchParams.delete('matching')
		goto(url, {replaceState: true})
	}

	function playFilteredTracks() {
		if (!hasActionableSelection) return
		const deckId = ensureActiveDeck().id
		const ids = visibleTracks.map((t) => t.id)
		loadDeckView(deckId, filteredAutoView, ids, {title: filteredPlaylistTitle})
		playTrack(deckId, ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!hasActionableSelection) return
		// With no deck open there is no queue to append to — start playing instead
		if (!appState.decks[appState.active_deck_id]) return playFilteredTracks()
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
		url.searchParams.delete('mention')
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

{#snippet filterActions(closeDialog = false)}
	<menu class="row filter-actions">
		<button
			type="button"
			class="primary"
			onclick={() => {
				playFilteredTracks()
				if (closeDialog) showFiltersModal = false
			}}
		>
			<Icon icon="play-fill" />
			{m.tracks_play_filtered({count: visibleTracks.length})}
		</button>
		<button type="button" class="ghost" onclick={queueFilteredTracks}>
			<Icon icon="unordered-list" />
			{m.track_add_to_queue()}
		</button>
	</menu>
{/snippet}

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if allTracks.length}
		<div class="controls-row">
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
				bind:value={() => searchValue, setSearchValue}
				placeholder={`${visibleTracks.length}/${allTracks.length}`}
				debounce={150}
				autofocus={page.state.focus === true}
			/>
			<PopoverMenu closeOnClick={false}>
				{#snippet trigger()}
					<Icon
						icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'}
						strokeWidth={1.5}
					/>
				{/snippet}
				<SortControls bind:order bind:direction onreshuffle={handleReshuffle} />
			</PopoverMenu>
		</div>
	{/if}
{/snippet}

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
					<button type="button" class="ghost" onclick={clearTrackFilters}>
						{m.common_clear()}
					</button>
				</div>
			{/if}
		</header>
	{/snippet}
	{#snippet dialogTop()}
		<div class="filters-stats-row">
			<p class="filters-stats">
				<strong>{visibleTracks.length}</strong> / {allTracks.length}
				{m.nav_tracks()}
			</p>
			{#if hasActionableSelection}
				{@render filterActions(true)}
			{/if}
		</div>
		{#if activeFilterCount > 0}
			<FilterChips
				search={searchValue}
				{mention}
				onClearMention={clearMentionFilter}
				matching={matchingSlug}
				tags={selectedTags}
				onRemoveTag={toggleTag}
				onClearMatching={clearMatchingFilter}
			/>
		{/if}
	{/snippet}
</TagsFilterDialog>

{#if channel}
	<Subpage
		title={m.nav_tracks()}
		loading={tracksQuery.isLoading && allTracks.length === 0}
		empty={tracksQuery.isReady && allTracks.length === 0}
	>
		{#snippet emptyChildren()}
			<p>{m.channel_no_tracks()}</p>
		{/snippet}
		<section class="tracks-page">
			<header>
				{#if hasActionableSelection || (isFiltering && (selectedTags.length > 0 || matchingSlug || mention))}
					<div class="row filter-row">
						{#if isFiltering && (selectedTags.length > 0 || matchingSlug || mention)}
							<FilterChips
								{mention}
								onClearMention={clearMentionFilter}
								matching={matchingSlug}
								tags={selectedTags}
								onRemoveTag={toggleTag}
								onClearMatching={clearMatchingFilter}
							/>
						{/if}
						{#if mention}
							<ChannelMicroCard slug={mention} />
						{/if}
						{#if hasActionableSelection}
							<menu class="results-actions">
								<button type="button" title={m.common_play()} onclick={playFilteredTracks}
									><Icon icon="play-fill" /><span>{m.common_play()}</span></button
								>
								<button type="button" title={m.common_queue()} onclick={queueFilteredTracks}
									><Icon icon="unordered-list" /><span>{m.common_queue()}</span></button
								>
								{#if channel && canShowFilteredAutoRadio}
									<AutoRadioButton
										live={isFilteredAutoActive && isFilteredAutoPlaying}
										drifted={isFilteredAutoDrifted}
										title={isFilteredAutoDrifted
											? m.auto_radio_resync()
											: m.tracks_auto_radio_selection()}
										showLabel
										onclick={() =>
											joinAutoRadio(
												appState.active_deck_id,
												filteredAutoRadioTracks,
												filteredAutoView
											)}
									/>
								{/if}
							</menu>
						{/if}
					</div>
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
					{selectedTags}
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
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tracks-page {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		padding-top: var(--space-2);
		padding-inline: 0.5rem;
	}

	.filter-toggle {
		font-size: var(--font-3);
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
	}

	.results-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-inline-start: auto;
	}

	.filters-stats {
		margin: 0;
	}

	.filters-stats-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.filter-actions {
		align-items: center;
	}

	.filter-row {
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}

	/* Connect the chips to the hashtag filter toggle in the nav row above */
	header :global(.filter-chips)::before {
		content: '└';
		align-self: center;
		margin-left: 0.5rem;
		color: var(--gray-9);
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

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
