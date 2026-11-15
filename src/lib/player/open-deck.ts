import {addDeck, appState} from '#lib/app-state.svelte.js'
import type {Deck} from '#lib/types.js'

/** Add a compact deck and make it the active one. */
export function openDeck(): Deck {
	const deck = addDeck()
	deck.compact = true
	appState.active_deck_id = deck.id
	return deck
}
