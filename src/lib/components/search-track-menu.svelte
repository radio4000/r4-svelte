<script>
	import {goto} from '$app/navigation'
	import {addToPlaylist, joinAutoRadio, loadDeckView, playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {viewToUrl} from '$lib/views'
	import {getAutoDecksForView} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'

	let {tracks, title = '', view = undefined, basePath = '/search'} = $props()

	const autoRadioTracks = $derived(toAutoTracks(tracks))
	const canShowAutoRadio = $derived(hasAutoRadioCoverage(tracks))
	const searchAutoDecks = $derived.by(() =>
		view ? getAutoDecksForView(Object.values(appState.decks), view) : []
	)
	const isSearchAutoActive = $derived(searchAutoDecks.length > 0)
	const isSearchAutoPlaying = $derived(searchAutoDecks.some((d) => d.is_playing))
	const isSearchAutoDrifted = $derived(searchAutoDecks.some((d) => d.auto_radio_drifted))
	const source = $derived(view?.sources?.[0] ?? {})
	const hasSortFilter = $derived((view?.order ?? 'created') !== 'created' || view?.direction === 'asc')
	const hasLimitFilter = $derived(Boolean(view?.limit))
	const filterCount = $derived.by(() => {
		let count = 0
		if (source.channels?.length) count += 1
		if (source.tags?.length) count += 1
		if (source.search) count += 1
		if (hasSortFilter) count += 1
		if (hasLimitFilter) count += 1
		return count
	})
	const hasFilters = $derived(filterCount > 0)

	async function playSearchResults() {
		if (!tracks.length) return
		const ids = tracks.map((t) => t.id)
		if (view) loadDeckView(appState.active_deck_id, view, ids, {title})
		else setPlaylist(appState.active_deck_id, ids, {title})
		await playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueSearchResults() {
		if (!tracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((t) => t.id)
		)
	}

	function clearFilters() {
		if (!view) return
		goto(viewToUrl(basePath, {sources: [{}]}), {replaceState: true})
	}
</script>

<menu class="search-track-menu">
	<ButtonFeedback onclick={playSearchResults}>
		{#snippet successChildren()}<Icon icon="play-fill" />
			{m.search_playing({count: tracks.length})}{/snippet}
		<Icon icon="play-fill" />{m.search_play_all()}
	</ButtonFeedback>
	<ButtonFeedback onclick={queueSearchResults}>
		{#snippet successChildren()}<Icon icon="next-fill" />
			{m.search_queued({count: tracks.length})}{/snippet}
		<Icon icon="next-fill" />{m.search_queue_all()}
	</ButtonFeedback>
	{#if canShowAutoRadio}
		<AutoRadioButton
			synced={isSearchAutoActive && isSearchAutoPlaying && !isSearchAutoDrifted}
			title={isSearchAutoDrifted ? m.auto_radio_resync() : m.search_auto_radio_this()}
			onclick={() => joinAutoRadio(appState.active_deck_id, autoRadioTracks, view)}
		/>
	{/if}
	{#if view}
		<PopoverMenu align="end">
			{#snippet trigger()}
				<Icon icon="filter-alt" />
				{hasFilters ? `(${filterCount})` : ''}
			{/snippet}
			<section class="filter-summary">
				<p>
					<strong>{m.views_filters_label()}</strong>
				</p>
				{#if source.channels?.length}<p>@{source.channels.join(', @')}</p>{/if}
				{#if source.tags?.length}<p>#{source.tags.join(', #')}</p>{/if}
				{#if source.search}<p>"{source.search}"</p>{/if}
				{#if hasSortFilter}<p>{view.order ?? 'created'} · {view.direction ?? 'desc'}</p>{/if}
				{#if hasLimitFilter}<p>limit {view.limit}</p>{/if}
				{#if !hasFilters}<p>None</p>{/if}
				{#if hasFilters}
					<button type="button" onclick={clearFilters}>{m.common_clear()}</button>
				{/if}
			</section>
		</PopoverMenu>
	{/if}
</menu>

<style>
	.search-track-menu {
		margin-left: 0;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.filter-summary {
		display: grid;
		gap: 0.35rem;
		min-width: min(28rem, 75vw);
		p {
			margin: 0;
		}
	}
</style>
