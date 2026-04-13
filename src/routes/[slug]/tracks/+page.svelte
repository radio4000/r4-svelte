<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Dialog from '$lib/components/dialog.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist} from '$lib/api'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {getChannelTags} from '$lib/utils'
	import {processViewTracks, getAutoDecksForView} from '$lib/views.svelte'
	import type {View} from '$lib/views'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()

	let searchInput = $state(page.url.searchParams.get('q') ?? '')
	let selectedTags = $derived(page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? [])
	let searchValue = $derived(page.url.searchParams.get('q') ?? '')
	let tagsSearch = $state('')
	let tagsSort = $state<'count' | 'alpha'>('count')
	let tagsDirection = $state<'asc' | 'desc'>('desc')
	let showFiltersModal = $state(false)
	const tagsSortOptions = [
		{value: 'count' as const, icon: 'hash' as const, label: () => m.tags_sort_count()},
		{value: 'alpha' as const, icon: 'sort' as const, label: () => m.tags_sort_alpha()}
	]

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

	let slug = $derived(page.params.slug)
	let channel = $derived(channelCtx.data)
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let aggregatedTags = $derived(getChannelTags(allTracks))
	let isFiltering = $derived(searchValue !== '' || selectedTags.length > 0)
	let activeFilterCount = $derived(selectedTags.length + (searchValue ? 1 : 0))
	let selectedTagsSort = $derived(tagsSortOptions.find((option) => option.value === tagsSort) ?? tagsSortOptions[0])
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
		processViewTracks(allTracks, {
			sources: [
				{
					tags: selectedTags.length ? selectedTags : undefined,
					tagsMode: 'all',
					search: searchValue || undefined
				}
			]
		})
	)
	let visibleTracks = $derived(isFiltering ? filteredTracks : allTracks)
	let hasFilteredResults = $derived(
		isFiltering && filteredTracks.length > 0 && filteredTracks.length < allTracks.length
	)
	let filteredAutoRadioTracks = $derived(toAutoTracks(filteredTracks))
	let canShowFilteredAutoRadio = $derived(hasAutoRadioCoverage(filteredTracks))
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
		return ''
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

	function playFilteredTracks() {
		if (!hasFilteredResults) return
		const ids = filteredTracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: filteredPlaylistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!hasFilteredResults) return
		addToPlaylist(
			appState.active_deck_id,
			filteredTracks.map((t) => t.id)
		)
	}

	function clearTrackFilters() {
		const url = new URL(page.url)
		url.searchParams.delete('tags')
		url.searchParams.delete('q')
		goto(url, {replaceState: true})
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
			<Icon icon="filter-alt" />
			{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
		</button>
		<SearchInput
			bind:value={searchInput}
			placeholder={`${visibleTracks.length}/${allTracks.length}`}
			debounce={150}
			autofocus={page.state.focus === true}
		/>
		{#if hasFilteredResults}
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
			<h2>Tags filter</h2>
		{/snippet}
		<section class="filters-dialog">
			<p class="filters-stats"><strong>{visibleTracks.length}</strong> / {allTracks.length} {m.nav_tracks()}</p>
			{#if activeFilterCount > 0}
				<menu class="row filter-tags">
					{#if searchValue}
						<li><span class="chip">"{searchValue}"</span></li>
					{/if}
					{#each selectedTags as tag (tag)}
						<li><button type="button" class="chip" onclick={() => toggleTag(tag)}>{tag} ×</button></li>
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
							title={
								tagsDirection === 'asc' ? m.channels_tooltip_sort_asc() : m.channels_tooltip_sort_desc()
							}
							onclick={() => (tagsDirection = tagsDirection === 'asc' ? 'desc' : 'asc')}
						>
							<Icon icon={tagsDirection === 'asc' ? 'funnel-ascending' : 'funnel-descending'} />
						</button>
					</div>
				</div>
				<menu class="tags-menu">
					{#each visibleTags as { value, count } (value)}
						<button type="button" class:active={selectedTags.includes(value)} onclick={() => toggleTag(value)}>
							#{value} <span class="tag-count">({count})</span>
						</button>
					{/each}
				</menu>
			</section>
		</section>
		{#snippet footer()}
			<menu class="row filter-actions">
				{#if hasFilteredResults}
					<button type="button" title={m.common_play()} onclick={playFilteredTracks}
						><Icon icon="play-fill" /> {m.common_play()}</button
					>
					<button type="button" title={m.common_queue()} onclick={queueFilteredTracks}
						><Icon icon="next-fill" /> {m.common_queue()}</button
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
				{#if activeFilterCount > 0}
					<button type="button" class="ghost" onclick={clearTrackFilters}>{m.common_clear()}</button>
				{/if}
			</menu>
		{/snippet}
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
				{#if isFiltering && selectedTags.length > 0}
					<menu class="row filter-tags">
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
				{#if isFiltering && tracksQuery.isReady && filteredTracks.length === 0}
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

	.filter-actions {
		flex-wrap: wrap;
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
