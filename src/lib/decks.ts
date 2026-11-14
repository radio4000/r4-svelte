import {appState} from '#lib/app-state.svelte.js'
import {sortedListeningDeckIds} from '#lib/deck.js'
import {isMobileViewport} from '#lib/utils.js'
import type {Deck} from '#lib/types.js'

export function getDeck(deckId: number): Deck | undefined {
	return appState.decks[deckId]
}

/** Clear a deck's auto-radio mode flags (not auto_radio_rotation_start — callers that need a
 *  full reset, like a normal-play mode switch, clear that separately). */
export function clearAutoRadio(deck: Deck) {
	deck.auto_radio = undefined
	deck.auto_radio_drifted = undefined
}

/** Apply a change to a deck, or to every deck in its listening group if it's listening to a
 *  broadcast — the group of decks tuned to the same channel act as one unit for layout toggles. */
export function applyToListeningGroup(deck: Deck, fn: (d: Deck) => void) {
	if (deck.listening_to_channel_id) {
		// Only one broadcast is listened to at a time, so all listening decks form one group.
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

/** Toggle video player visibility. Listening decks (tuned to the same broadcast) toggle together. */
export function toggleVideo(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.hide_video_player
	applyToListeningGroup(deck, (d) => (d.hide_video_player = newValue))
}

/** Expand a deck fullscreen. Any other expanded deck returns to compact.
 *  Listening decks expand as a group, like the other layout toggles. */
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

/** Compact/expand a deck. On mobile, leaving compact goes fullscreen via expandDeck. */
export function toggleDeckCompact(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.compact
	// Mobile has no in-strip state: leaving compact goes straight to fullscreen
	if (!newValue && isMobileViewport()) {
		expandDeck(deckId)
		return
	}
	applyToListeningGroup(deck, (d) => {
		d.compact = newValue
		if (newValue && d.expanded) d.expanded = false
	})
}

/** Fullscreen a deck (on desktop applies to the whole listening group). */
export function togglePlayerExpanded(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.expanded
	// Mobile has no in-strip state: expand fullscreen or collapse to compact
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
