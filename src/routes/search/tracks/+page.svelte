<script>
	import {page} from '$app/state'
	import {afterNavigate, goto} from '$app/navigation'
	import {Debounced} from 'runed'
	import {queryView, getAutoDecksForView} from '$lib/views.svelte'
	import {parseView, serializeView, viewFromUrl, viewLabel} from '$lib/views'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchTabs from '$lib/components/search-tabs.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	let inputValue = $state(page.url.searchParams.get('q') ?? '')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// URL is the single source of truth
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	function viewToUrl(v) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams()
		const label = viewLabel(v)
		if (label) params.set('q', label)
		if (v.order) params.set('order', v.order)
		if (v.direction) params.set('direction', v.direction)
		if (v.limit) params.set('limit', String(v.limit))
		const str = params.toString()
		return str ? `/search/tracks?${str}` : '/search/tracks'
	}

	let inputSeeded = !!page.url.searchParams.get('q')
	afterNavigate(({type}) => {
		if (type === 'goto') return
		const seeded = page.url.searchParams.get('q') ?? ''
		inputValue = seeded
		inputSeeded = !!seeded
	})

	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) return
		if (inputSeeded) {
			inputSeeded = false
			return
		}
		const resolved = parseView(q)
		goto(viewToUrl(resolved), {replaceState: true})
	})

	function handleSubmit(e) {
		e.preventDefault()
		const q = inputValue.trim()
		if (!q) {
			goto('/search/tracks', {replaceState: true})
			return
		}
		debouncedInput.setImmediately(inputValue)
	}

	function onViewsBarChange(v) {
		inputSeeded = true
		inputValue = viewLabel(v)
		goto(viewToUrl(v), {replaceState: true})
	}

	// Play / Queue
	const deckKeys = $derived(Object.keys(appState.decks))
	const multiDeck = $derived(deckKeys.length > 1)
	const deckLabel = $derived(multiDeck ? `Deck ${deckKeys.indexOf(String(appState.active_deck_id)) + 1}` : '')

	async function playSearchResults() {
		if (!tracks.length) return
		const ids = tracks.map((t) => t.id)
		await playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		setPlaylist(appState.active_deck_id, ids, {title: inputValue.trim()})
	}

	function queueSearchResults() {
		if (!tracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((t) => t.id)
		)
	}

	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const tracksLoading = $derived(viewQuery.loading)
	const autoRadioTracks = $derived(toAutoTracks(tracks))
	const canShowAutoRadio = $derived(hasAutoRadioCoverage(tracks))
	const searchAutoDecks = $derived.by(() => getAutoDecksForView(Object.values(appState.decks), view))
	const isSearchAutoActive = $derived(searchAutoDecks.length > 0)
	const isSearchAutoDrifted = $derived(searchAutoDecks.some((d) => d.auto_radio_drifted))
</script>

<svelte:head>
	<title>{m.search_title()}</title>
</svelte:head>

<article {@attach fromAction(trap)}>
	<header class="search-header">
		<SearchTabs />
		<form onsubmit={handleSubmit}>
			<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
			<SearchInput id="{uid}-search" bind:value={inputValue} placeholder={m.header_search_placeholder()} autofocus />
		</form>
		<ViewsBar {view} onchange={onViewsBarChange} />
	</header>

	{#if hasFilter}
		{#if !tracksLoading && tracks.length === 0}
			<p>{m.search_no_results()} "{inputValue || serializeView(view)}"</p>
		{/if}

		{#if tracksLoading}
			<p><rough-spinner spinner="14" interval="150"></rough-spinner> {m.search_loading_tracks()}</p>
		{:else if tracks.length}
			<section class="track-results">
				<header>
					<h2>
						{tracks.length === 1
							? m.search_track_one({count: tracks.length})
							: m.search_track_other({count: tracks.length})}
					</h2>
					<menu>
						<ButtonFeedback onclick={playSearchResults}>
							{#snippet successChildren()}<Icon icon="play-fill" />
								{m.search_playing({count: tracks.length})}{/snippet}
							<Icon icon="play-fill" />{multiDeck ? m.search_play_on_deck({deck: deckLabel}) : m.search_play_all()}
						</ButtonFeedback>
						<ButtonFeedback onclick={queueSearchResults}>
							{#snippet successChildren()}<Icon icon="next-fill" />
								{m.search_queued({count: tracks.length})}{/snippet}
							<Icon icon="next-fill" />{multiDeck ? m.search_add_to_deck({deck: deckLabel}) : m.search_queue_all()}
						</ButtonFeedback>
						{#if canShowAutoRadio}
							<AutoRadioButton
								synced={isSearchAutoActive && !isSearchAutoDrifted}
								title={isSearchAutoDrifted ? m.auto_radio_resync() : m.search_auto_radio_this()}
								onclick={() => joinAutoRadio(appState.active_deck_id, autoRadioTracks, view)}
							/>
						{/if}
					</menu>
				</header>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li><TrackCard {track} {index} showSlug={true} /></li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<p><small>{m.search_tip_slug()}</small></p>
	{/if}
</article>

<style>
	.search-header {
		position: sticky;
		top: 0;
		background: var(--body-bg);
		z-index: 3;
		padding: 0.5rem;
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.search-header :global(.search-tabs) {
		flex-shrink: 0;
	}

	.search-header form {
		flex: 1 1 0;
		min-width: min(200px, 100%);
	}

	.search-header form :global(input) {
		width: 100%;
	}

	.search-header :global(.views-bar) {
		flex-shrink: 0;
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

	.track-results > header > menu {
		margin-left: 0;
		flex-wrap: wrap;
	}

	menu,
	section {
		margin-bottom: 1rem;
	}
</style>
