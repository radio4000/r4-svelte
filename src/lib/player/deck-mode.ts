/** Whether a deck plays its own queue or follows a clock (auto-radio, a broadcast). */
import type {Deck, Track} from '#lib/types.js'
import {playbackState, AUTO_RADIO_SYNC_GRACE_MS, type AutoTrack} from '#lib/player/auto-radio.js'
import {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '#lib/broadcast-utils.js'
import {resyncAutoRadio, leaveAutoRadio} from '#lib/player/auto-radio-actions.js'
import {resyncBroadcastDeck, leaveBroadcast} from '#lib/broadcast.js'

export type DeckModeKind = 'queue' | 'auto' | 'listening'

/** No `trackId` means only the offset is checked. */
export type Expected = {trackId?: string; offset: number}

/** Getters, so a deck only depends on what its mode reads. */
export interface PlaybackContext {
	readonly currentTime: number
	readonly track: Track | undefined
	readonly autoTracks: AutoTrack[]
	readonly autoTotalDuration: number
}

export interface DeckMode {
	readonly kind: DeckModeKind
	readonly followsClock: boolean
	/** A track ending or failing plays the next one in the queue. Auto-radio's queue is the schedule. */
	readonly advancesOnEnd: boolean
	readonly seekable: boolean
	/** What should be playing now: an expectation, `null` when there is no schedule (counts as
	 *  drifted), or `undefined` when it can't be judged yet. */
	expected(deck: Deck, ctx: PlaybackContext): Expected | null | undefined
	drifted(deck: Deck | undefined): boolean
	setDrifted(deck: Deck, drifted: boolean): void
	resync(deckId: number): Promise<void>
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

export function modeOf(deck: Deck | undefined): DeckMode {
	if (deck?.listening_to_channel_id) return listeningMode
	if (deck?.auto_radio) return autoMode
	return queueMode
}

/** `undefined` when the mode can't judge yet. */
export function isDrifted(deck: Deck, ctx: PlaybackContext): boolean | undefined {
	const expected = modeOf(deck).expected(deck, ctx)
	if (expected === undefined) return undefined
	if (expected === null) return true
	if (expected.trackId !== undefined && expected.trackId !== deck.playlist_track) return true
	return Math.abs(ctx.currentTime - expected.offset) > DRIFT_TOLERANCE_SECONDS
}
