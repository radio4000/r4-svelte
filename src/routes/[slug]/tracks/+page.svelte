<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
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
	let order: View['order'] = $state('created')
	let direction: View['direction'] = $state('desc')

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
		goto(`${url.pathname}${url.search}`, {replaceState: true})
	})

	let slug = $derived(page.params.slug)
	let channel = $derived(channelCtx.data)
	let allTracks = $derived(tracksQuery.data || [])
	let canEdit = $derived(canEditChannel(channel?.id))
	let aggregatedTags = $derived(getChannelTags(allTracks))
	let isSearching = $derived(searchValue !== '' || selectedTags.length > 0)
	let isSorting = $derived(order !== 'created' || direction !== 'desc')
	let isFiltering = $derived(isSearching || isSorting)
	let filteredTracks = $derived(
		processViewTracks(allTracks, {
			sources: [
				{
					tags: selectedTags.length ? selectedTags : undefined,
					tagsMode: 'all',
					search: searchValue || undefined
				}
			],
			order: isSorting ? order : undefined,
			direction: isSorting ? direction : undefined
		})
	)
	let visibleTracks = $derived(isFiltering ? filteredTracks : allTracks)
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
	let filteredAutoDecks = $derived.by(() => getAutoDecksForView(Object.values(appState.decks), filteredAutoView))
	let isFilteredAutoActive = $derived(filteredAutoDecks.length > 0)
	let isFilteredAutoDrifted = $derived(filteredAutoDecks.some((d) => d.auto_radio_drifted))
	let filteredPlaylistTitle = $derived.by(() => {
		const search = searchValue.trim()
		if (search) return search
		if (selectedTags.length) return selectedTags.map((tag) => `#${tag}`).join(' ')
		return ''
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
		goto(`${url.pathname}${url.search}`, {replaceState: true})
	}

	function playFilteredTracks() {
		if (!filteredTracks.length) return
		const ids = filteredTracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: filteredPlaylistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueFilteredTracks() {
		if (!filteredTracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			filteredTracks.map((t) => t.id)
		)
	}
</script>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if allTracks.length}
		{#if aggregatedTags.length > 0}
			<PopoverMenu>
				{#snippet trigger()}
					<Icon icon="hash" />{selectedTags.length > 0 ? `(${selectedTags.length})` : ''}
				{/snippet}
				<menu class="tags-menu">
					{#each aggregatedTags as { value, count } (value)}
						<button type="button" class:active={selectedTags.includes(value)} onclick={() => toggleTag(value)}>
							{value} <span class="tag-count">({count})</span>
						</button>
					{/each}
				</menu>
			</PopoverMenu>
		{/if}
		<SearchInput
			bind:value={searchInput}
			placeholder={m.tracks_filter_placeholder({count: allTracks.length})}
			debounce={150}
		/>
		{#if visibleTracks.length}
			<button type="button" title={m.common_play()} onclick={playFilteredTracks}><Icon icon="play-fill" /></button>
			<button type="button" title={m.common_queue()} onclick={queueFilteredTracks}><Icon icon="next-fill" /></button>
			{#if channel && canShowFilteredAutoRadio}
				<AutoRadioButton
					synced={isFilteredAutoActive && !isFilteredAutoDrifted}
					title={isFilteredAutoDrifted ? m.auto_radio_resync() : m.tracks_auto_radio_selection()}
					onclick={() => joinAutoRadio(appState.active_deck_id, filteredAutoRadioTracks, filteredAutoView)}
				/>
			{/if}
		{/if}
		<PopoverMenu closeOnClick={false} style="margin-left: auto;">
			{#snippet trigger()}<Icon
					icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'}
					strokeWidth={1.5}
				/>{/snippet}
			<SortControls bind:order bind:direction />
		</PopoverMenu>
	{/if}
{/snippet}

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

	.tag-count {
		opacity: 0.6;
		font-size: 0.85em;
	}

	.filter-tags {
		flex-wrap: wrap;
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
