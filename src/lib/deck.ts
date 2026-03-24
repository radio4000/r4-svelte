import type {Deck} from '$lib/types'
import {viewLabel} from '$lib/views'

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

/** Find a deck playing a channel, preferring active deck. */
export function findChannelPlayingDeck(
	decks: Record<number, Deck>,
	activeDeckId: number,
	slug?: string
): Deck | undefined {
	if (!slug) return undefined
	const active = decks[activeDeckId]
	if (active && active.playlist_slug === slug) return active
	return deckValues(decks).find((d) => d.playlist_slug === slug && d.is_playing)
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
