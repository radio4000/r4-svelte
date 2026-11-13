import {addDeck, appState} from '#lib/app-state.svelte.js'
import type {Deck} from '#lib/types.js'

/** Add a deck. `compact` collapses it into the bar, `activate` makes it the active deck. */
export function openDeck({compact, activate}: {compact?: boolean; activate?: boolean} = {}): Deck {
	const deck = addDeck()
	if (compact) deck.compact = true
	if (activate) appState.active_deck_id = deck.id
	return deck
}
