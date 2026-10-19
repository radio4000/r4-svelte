import type {ReadonlyURL} from '$app/state'
import type {Deck} from '#lib/types.js'
import {viewLabel} from '#lib/views.js'

/** Deck title: use the given title, or derive one from the view/slug. */
export function deckTitle(deck: Deck | undefined, title?: string): string {
	if (title) return title
	const label = deck?.view ? viewLabel(deck.view) : undefined
	return label || (deck?.playlist_slug ? `@${deck.playlist_slug}` : '@unknown')
}

/** All decks as an array (from the Record). */
export function deckValues(decks: Record<number, Deck>): Deck[] {
	return Object.values(decks)
}

/** Auto-radio decks whose channel matches a slug (via view source or playlist_slug). */
export function findAutoDecksForChannel(decks: Record<number, Deck>, slug?: string): Deck[] {
	if (!slug) return []
	return deckValues(decks).filter(
		(d) => d.auto_radio && (d.view?.sources[0]?.channels?.[0] === slug || d.playlist_slug === slug)
	)
}

/** Pick which auto-radio deck to resync: prefer the active deck if it matches, else first auto deck. */
export function pickAutoResyncDeck(
	decks: Record<number, Deck>,
	activeDeckId: number,
	slug?: string,
	autoDecks?: Deck[]
): number | undefined {
	const candidates = autoDecks ?? findAutoDecksForChannel(decks, slug)
	if (!candidates.length) return undefined
	const active = decks[activeDeckId]
	if (
		active?.auto_radio &&
		(active.view?.sources[0]?.channels?.[0] === slug || active.playlist_slug === slug)
	) {
		return active.id
	}
	return candidates[0]?.id
}

/** Find the deck playing a specific channel slug (is_playing). */
export function findPlayingDeck(decks: Record<number, Deck>, slug?: string): Deck | undefined {
	if (!slug) return undefined
	return deckValues(decks).find((d) => d.playlist_slug === slug && d.is_playing)
}

/** Find any deck loaded with a specific channel slug (not necessarily playing). */
export function findLoadedDeck(decks: Record<number, Deck>, slug?: string): Deck | undefined {
	if (!slug) return undefined
	return deckValues(decks).find((d) => d.playlist_slug === slug)
}

/**
 * Find the deck holding a channel slug — the re-tap target for "play this channel".
 * Prefer the active deck, then a deck currently playing the slug, then any loaded deck.
 * Resolving display and action through this one helper keeps them on the same deck.
 */
export function findChannelDeck(
	decks: Record<number, Deck>,
	activeDeckId: number,
	slug?: string
): Deck | undefined {
	if (!slug) return undefined
	const active = decks[activeDeckId]
	if (active?.playlist_slug === slug) return active
	return findPlayingDeck(decks, slug) ?? findLoadedDeck(decks, slug)
}

/** Find a deck listening to a channel (by channel ID), preferring active deck. */
export function findListeningDeck(
	decks: Record<number, Deck>,
	activeDeckId: number,
	channelId?: string
): Deck | undefined {
	if (!channelId) return undefined
	const active = decks[activeDeckId]
	if (active?.listening_to_channel_id === channelId) return active
	return deckValues(decks).find((d) => d.listening_to_channel_id === channelId)
}

/** Check if any deck is broadcasting for a given channel ID. */
export function isBroadcasting(decks: Record<number, Deck>, channelId?: string): boolean {
	if (!channelId) return false
	return deckValues(decks).some((d) => d.broadcasting_channel_id === channelId)
}

/** Check if any deck is playing a given channel slug. */
export function isChannelPlaying(decks: Record<number, Deck>, slug?: string): boolean {
	if (!slug) return false
	return deckValues(decks).some((d) => d.playlist_slug === slug && d.is_playing)
}

/** Check if any deck is listening to a given channel ID. */
export function isListeningToChannel(decks: Record<number, Deck>, channelId?: string): boolean {
	if (!channelId) return false
	return deckValues(decks).some((d) => d.listening_to_channel_id === channelId)
}

/** All deck IDs, sorted ascending. */
export function sortedDeckIds(decks: Record<number, Deck>): number[] {
	return Object.keys(decks)
		.map(Number)
		.sort((a, b) => a - b)
}

/** Deck IDs currently listening to a broadcast, sorted ascending. */
export function sortedListeningDeckIds(decks: Record<number, Deck>): number[] {
	return deckValues(decks)
		.filter((d) => Boolean(d.listening_to_channel_id))
		.map((d) => d.id)
		.sort((a, b) => a - b)
}

/**
 * Whether this deck should show the shared listening-group controls (sync button,
 * leave-broadcast) — true for non-listening decks, or the first deck in a listening group.
 */
export function isGroupControlDeck(
	deck: Deck | undefined,
	deckId: number,
	listeningDeckIds: number[]
): boolean {
	return !deck?.listening_to_channel_id || listeningDeckIds[0] === deckId
}

/** Whether the player UI should render, based on the `?player=false` URL param. */
export function showPlayerParam(url: ReadonlyURL): boolean {
	return url.searchParams.get('player') !== 'false'
}
