<script>
	import {addToPlaylist, joinAutoRadio, loadDeckView, playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {getAutoDecksForView} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'

	let {tracks, title = '', view = undefined} = $props()

	const deckKeys = $derived(Object.keys(appState.decks))
	const multiDeck = $derived(deckKeys.length > 1)
	const deckLabel = $derived(
		multiDeck ? `Deck ${deckKeys.indexOf(String(appState.active_deck_id)) + 1}` : ''
	)

	const autoRadioTracks = $derived(toAutoTracks(tracks))
	const canShowAutoRadio = $derived(hasAutoRadioCoverage(tracks))
	const searchAutoDecks = $derived.by(() =>
		view ? getAutoDecksForView(Object.values(appState.decks), view) : []
	)
	const isSearchAutoActive = $derived(searchAutoDecks.length > 0)
	const isSearchAutoPlaying = $derived(searchAutoDecks.some((d) => d.is_playing))
	const isSearchAutoDrifted = $derived(searchAutoDecks.some((d) => d.auto_radio_drifted))

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
</script>

<menu>
	<ButtonFeedback onclick={playSearchResults}>
		{#snippet successChildren()}<Icon icon="play-fill" />
			{m.search_playing({count: tracks.length})}{/snippet}
		<Icon icon="play-fill" />{multiDeck
			? m.search_play_on_deck({deck: deckLabel})
			: m.search_play_all()}
	</ButtonFeedback>
	<ButtonFeedback onclick={queueSearchResults}>
		{#snippet successChildren()}<Icon icon="next-fill" />
			{m.search_queued({count: tracks.length})}{/snippet}
		<Icon icon="next-fill" />{multiDeck
			? m.search_add_to_deck({deck: deckLabel})
			: m.search_queue_all()}
	</ButtonFeedback>
	{#if canShowAutoRadio}
		<AutoRadioButton
			synced={isSearchAutoActive && isSearchAutoPlaying && !isSearchAutoDrifted}
			title={isSearchAutoDrifted ? m.auto_radio_resync() : m.search_auto_radio_this()}
			onclick={() => joinAutoRadio(appState.active_deck_id, autoRadioTracks, view)}
		/>
	{/if}
</menu>

<style>
	menu {
		margin-left: 0;
		flex-wrap: wrap;
	}
</style>
