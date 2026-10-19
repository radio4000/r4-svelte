<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState, removeDeck} from '#lib/app-state.svelte.js'
	import {
		toggleVideo,
		toggleQueuePanel,
		clearUserInitiatedPlay,
		leaveAutoRadio,
		rejoinAutoRadio
	} from '#lib/api.js'
	import {getBroadcastingChannelId, notifyBroadcastState, leaveBroadcast} from '#lib/broadcast.js'
	import {isGroupControlDeck, sortedListeningDeckIds} from '#lib/deck.js'
	import {trackAddSearchParams} from '#lib/track-add.js'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {{deckId: number, compact?: boolean, closeMenu?: () => void, deckEl?: HTMLElement | undefined, track?: import('#lib/types.js').Track, channel?: import('#lib/types.js').Channel, trackHref?: string, canEditTrack?: boolean, autoRadioAvailable?: boolean}} */
	let {
		deckId,
		compact = false,
		closeMenu,
		deckEl,
		track,
		channel,
		trackHref,
		canEditTrack = false,
		autoRadioAvailable = false
	} = $props()

	let deck = $derived(appState.decks[deckId])
	let isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))
	let listeningDeckIds = $derived(sortedListeningDeckIds(appState.decks))
	let isListeningGroupControlDeck = $derived(isGroupControlDeck(deck, deckId, listeningDeckIds))
	let hasListeningMultiDeck = $derived(listeningDeckIds.length > 1)
	let listeningVideoMixActive = $derived.by(() => {
		if (!hasListeningMultiDeck) return false
		return listeningDeckIds.some((id) => Boolean(appState.decks[id]?.video_mix))
	})

	let isFullscreen = $state(false)
	$effect(() => {
		const handler = () => (isFullscreen = !!document.fullscreenElement)
		document.addEventListener('fullscreenchange', handler)
		return () => document.removeEventListener('fullscreenchange', handler)
	})

	function getDeckElement() {
		return deckEl ?? document.querySelector(`[data-deck="${deckId}"]`)
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen()
		} else {
			const el = getDeckElement()
			el?.requestFullscreen?.()
		}
	}

	function toggleListeningVideoMix() {
		const next = !listeningVideoMixActive
		for (const id of listeningDeckIds) {
			const listeningDeck = appState.decks[id]
			if (!listeningDeck?.listening_to_channel_id) continue
			listeningDeck.video_mix = next
			if (next) listeningDeck.hide_video_player = false
		}
	}

	function closeDeck() {
		const bchId = getBroadcastingChannelId()
		clearUserInitiatedPlay(deckId)
		removeDeck(deckId)
		if (bchId) notifyBroadcastState(bchId)
	}

	function leaveBroadcastDecks() {
		listeningDeckIds.forEach((id) => leaveBroadcast(id))
	}

	function shareTrack() {
		if (!track || !channel) return
		appState.modal_share = {track, channel}
		closeMenu?.()
	}

	function addToRadio() {
		if (!track) return
		if (!appState.user) {
			const query = trackAddSearchParams(track).toString()
			const addPath = resolve('/add') + (query ? `?${query}` : '')
			const authPath = resolve('/auth') + `?redirect=${encodeURIComponent(addPath)}`
			goto(authPath)
			closeMenu?.()
			return
		}
		appState.modal_track_add = {track}
		closeMenu?.()
	}

	function editTrack() {
		if (!track) return
		appState.modal_track_edit = {track}
		closeMenu?.()
	}
</script>

<menu class="nav-vertical">
	{#if compact && track}
		{#if trackHref}
			<a href={trackHref} onclick={() => closeMenu?.()}>
				<Icon icon="circle-info" />
				{m.track_go_to()}
			</a>
			<button type="button" onclick={shareTrack}>
				<Icon icon="share" />
				{m.share_native()}
			</button>
		{/if}
		{#if !appState.embed_mode}
			<button type="button" onclick={addToRadio}>
				<Icon icon="add" />
				{m.track_add_to_radio()}
			</button>
		{/if}
		{#if canEditTrack}
			<button type="button" onclick={editTrack}>
				<Icon icon="edit" />
				{m.common_edit()}
			</button>
		{/if}
	{/if}

	{#if !compact}
		<button
			onclick={() => toggleVideo(deckId)}
			class:active={!deck?.hide_video_player}
			data-no-close
		>
			<Icon icon="tv" />
			{deck?.hide_video_player ? m.player_hidden() : m.player_visible()}
		</button>
		{#if !isListeningToBroadcast && !deck?.auto_radio}
			<button
				onclick={() => toggleQueuePanel(deckId)}
				class:active={!deck?.hide_queue_panel}
				data-no-close
			>
				<Icon icon="unordered-list" />
				{deck?.hide_queue_panel ? m.queue_hidden() : m.queue_visible()}
			</button>
		{/if}
	{/if}
	{#if isListeningToBroadcast && hasListeningMultiDeck}
		<button onclick={toggleListeningVideoMix} class:active={listeningVideoMixActive} data-no-close>
			<Icon icon="gradient" />
			{m.deck_menu_video_mix()}
		</button>
	{/if}

	{#if !compact}
		<button class:active={isFullscreen} onclick={toggleFullscreen} data-no-close>
			<Icon icon="fullscreen-alt" />
			{isFullscreen ? 'Exit full screen' : 'Full screen'}
		</button>
	{/if}

	{#if !appState.embed_mode}
		<a href={resolve('/settings/player')} onclick={() => closeMenu?.()}>
			<Icon icon="settings" />
			{m.settings_player()}
		</a>
	{/if}

	{#if deck?.auto_radio}
		<button
			onclick={() => {
				leaveAutoRadio(deckId)
				closeMenu?.()
			}}
		>
			<Icon icon="infinite" />
			{m.auto_radio_leave()}
		</button>
	{:else if autoRadioAvailable && !isListeningToBroadcast}
		<button
			onclick={() => {
				rejoinAutoRadio(deckId)
				closeMenu?.()
			}}
		>
			<Icon icon="infinite" />
			{m.auto_radio_join()}
		</button>
	{/if}

	{#if !isListeningToBroadcast}
		<button class="close-deck" onclick={closeDeck}>
			<Icon icon="close" />
			{m.player_tooltip_close_deck()}
		</button>
	{:else if isListeningGroupControlDeck}
		<button class="close-deck" onclick={leaveBroadcastDecks}>
			<Icon icon="close" />
			{m.broadcasts_leave()}
		</button>
	{/if}
</menu>
