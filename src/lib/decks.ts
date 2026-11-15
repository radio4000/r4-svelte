import {appState} from '#lib/app-state.svelte.js'
import {sortedListeningDeckIds} from '#lib/deck.js'
import {isMobileViewport} from '#lib/utils.js'
import type {Deck} from '#lib/types.js'

export function getDeck(deckId: number): Deck | undefined {
	return appState.decks[deckId]
}

export function clearAutoRadio(deck: Deck) {
	deck.auto_radio = undefined
	deck.auto_radio_drifted = undefined
}

export function applyToListeningGroup(deck: Deck, fn: (d: Deck) => void) {
	if (deck.listening_to_channel_id) {
		for (const id of sortedListeningDeckIds(appState.decks)) {
			const d = appState.decks[id]
			if (d) fn(d)
		}
	} else {
		fn(deck)
	}
}

// --- Deck layout toggles ---

export function toggleQueuePanel(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.hide_queue_panel = !deck.hide_queue_panel
}

export function toggleVideo(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.hide_video_player
	applyToListeningGroup(deck, (d) => (d.hide_video_player = newValue))
}

export function expandDeck(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const groupIds = deck.listening_to_channel_id ? sortedListeningDeckIds(appState.decks) : [deck.id]
	for (const d of Object.values(appState.decks)) {
		const inGroup = groupIds.includes(d.id)
		if (inGroup) {
			d.expanded = true
			d.compact = false
			d.hide_video_player = false
		} else if (d.expanded) {
			d.expanded = false
			d.compact = true
		}
	}
}

export function toggleDeckCompact(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.compact
	if (!newValue && isMobileViewport()) {
		expandDeck(deckId)
		return
	}
	applyToListeningGroup(deck, (d) => {
		d.compact = newValue
		if (newValue && d.expanded) d.expanded = false
	})
}

export function togglePlayerExpanded(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.expanded
	if (isMobileViewport()) {
		if (newValue) expandDeck(deckId)
		else toggleDeckCompact(deckId)
		return
	}
	applyToListeningGroup(deck, (d) => {
		d.expanded = newValue
		if (newValue && d.compact) d.compact = false
		if (newValue && d.hide_video_player) d.hide_video_player = false
	})
}
