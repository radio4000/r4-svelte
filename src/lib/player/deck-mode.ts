/**
 * Deck mode: whether a deck plays its own queue or follows a clock.
 *
 * Auto-radio and listening to a broadcast are the same thing to a deck: something
 * outside the queue says which track and second should be playing now. Decks and the
 * player ask the mode (`modeOf(deck)`) instead of branching on the fields below.
 *
 * The mode is read from persisted deck fields, never stored: `listening_to_channel_id`
 * wins over `auto_radio`, else the deck plays its queue. Saved decks and the broadcast
 * wire format stay as they are.
 */
import type {Deck, Track} from '#lib/types.js'
import {playbackState, AUTO_RADIO_SYNC_GRACE_MS, type AutoTrack} from '#lib/player/auto-radio.js'
import {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '#lib/broadcast-utils.js'
import {resyncAutoRadio, leaveAutoRadio} from '#lib/player/auto-radio-actions.js'
import {resyncBroadcastDeck, leaveBroadcast} from '#lib/broadcast.js'

export type DeckModeKind = 'queue' | 'auto' | 'listening'

/** Where playback should be now. No `trackId` means only the offset is checked. */
export type Expected = {trackId?: string; offset: number}

/** What the player knows right now. Getters, so a deck only depends on what its mode reads. */
export interface PlaybackContext {
	readonly currentTime: number
	/** The deck's resolved track row. */
	readonly track: Track | undefined
	/** The deck's queue as auto-radio tracks (those with a duration), in queue order. */
	readonly autoTracks: AutoTrack[]
	readonly autoTotalDuration: number
}

export interface DeckMode {
	readonly kind: DeckModeKind
	/** Follows a clock: no prev/next/shuffle/speed, no queue panel, no stall nudges, no lock-screen skip. */
	readonly followsClock: boolean
	/** A track ending or failing plays the next one in the queue. Auto-radio's queue is the schedule. */
	readonly advancesOnEnd: boolean
	/** The progress bar seeks. */
	readonly seekable: boolean
	/** What should be playing now: an expectation, `null` when there is no schedule (counts as
	 *  drifted), or `undefined` when it can't be judged yet. */
	expected(deck: Deck, ctx: PlaybackContext): Expected | null | undefined
	drifted(deck: Deck | undefined): boolean
	setDrifted(deck: Deck, drifted: boolean): void
	/** Jump back to what should be playing now. */
	resync(deckId: number): Promise<void>
	/** Stop following the clock. */
	leave(deckId: number): void
}

const queueMode: DeckMode = {
	kind: 'queue',
	followsClock: false,
	advancesOnEnd: true,
	seekable: true,
	expected: () => undefined,
	drifted: () => false,
	setDrifted: () => {},
	resync: async () => {},
	leave: () => {}
}

const autoMode: DeckMode = {
	kind: 'auto',
	followsClock: true,
	advancesOnEnd: true,
	seekable: true,
	expected(deck, ctx) {
		if (deck.auto_radio_rotation_start == null) return undefined
		const t = ctx.currentTime
		// Skip while the join/resync seek is still landing. joinAutoRadio/resyncAutoRadio
		// set auto_radio_drifted=false immediately, but the seek settles asynchronously —
		// evaluating in between flags a false positive on the very next timeupdate.
		if (Date.now() - (deck.auto_radio_synced_at ?? 0) < AUTO_RADIO_SYNC_GRACE_MS) return undefined
		if (t < DRIFT_TOLERANCE_SECONDS) return undefined
		const snap = playbackState(
			ctx.autoTracks,
			ctx.autoTotalDuration,
			deck.auto_radio_rotation_start,
			Date.now()
		)
		return snap ? {trackId: snap.currentTrack.id, offset: snap.offsetSeconds} : null
	},
	drifted: (deck) => Boolean(deck?.auto_radio_drifted),
	setDrifted(deck, drifted) {
		deck.auto_radio_drifted = drifted
	},
	resync: (deckId) => resyncAutoRadio(deckId),
	leave: (deckId) => leaveAutoRadio(deckId)
}

const listeningMode: DeckMode = {
	kind: 'listening',
	followsClock: true,
	advancesOnEnd: false,
	seekable: false,
	expected(deck, ctx) {
		const track = ctx.track
		if (!track) return undefined
		const offset = calculateSeekTime(deck, track)
		return offset == null ? undefined : {offset}
	},
	drifted: (deck) => Boolean(deck?.listening_drifted),
	setDrifted(deck, drifted) {
		deck.listening_drifted = drifted
	},
	resync: (deckId) => resyncBroadcastDeck(deckId),
	leave: (deckId) => leaveBroadcast(deckId)
}

/** The mode a deck is in, read from its fields. */
export function modeOf(deck: Deck | undefined): DeckMode {
	if (deck?.listening_to_channel_id) return listeningMode
	if (deck?.auto_radio) return autoMode
	return queueMode
}

/** The drift rule both clocks share: off by more than 2s, or on the wrong track.
 *  `undefined` when the mode can't judge yet. */
export function isDrifted(deck: Deck, ctx: PlaybackContext): boolean | undefined {
	const expected = modeOf(deck).expected(deck, ctx)
	if (expected === undefined) return undefined
	if (expected === null) return true
	if (expected.trackId !== undefined && expected.trackId !== deck.playlist_track) return true
	return Math.abs(ctx.currentTime - expected.offset) > DRIFT_TOLERANCE_SECONDS
}
