/**
 * Pure helpers for the broadcast wire format and sync calculations.
 * No app state or network deps — safe to import anywhere, easy to test.
 */

import {parseUrl} from 'media-now/parse-url'
import {isDbId} from '#lib/utils.js'

/** @typedef {import('#lib/types.js').BroadcastPlaybackFields} BroadcastPlaybackFields */
/** @typedef {import('#lib/types.js').Track} Track */
/** @typedef {import('#lib/types.js').BroadcastDeckState} BroadcastDeckState */
/** @typedef {{track_url: string | null, track_title: string | null, track_media_id: string | null}} EphemeralPayload */

/** Shared drift tolerance used by both broadcast and auto-radio drift effects. */
export const DRIFT_TOLERANCE_SECONDS = 2

/** Defaults for a deck with no playback state yet, sent out as its BroadcastDeckState. */
export const BROADCAST_STATE_DEFAULTS = {
	track_played_at: null,
	seeked_at: null,
	seek_position: null,
	is_playing: false,
	volume: 0,
	muted: false,
	speed: 1
}

/**
 * Pick the shared playback fields off any broadcast-shaped source (a Deck,
 * a Broadcast row, or a BroadcastDeckState) — same field names on both ends,
 * so this works for mapping in either direction. The field list is the keys
 * of BROADCAST_STATE_DEFAULTS.
 * @param {BroadcastPlaybackFields | null | undefined} source
 * @returns {BroadcastPlaybackFields}
 */
export function pickBroadcastFields(source) {
	/** @type {BroadcastPlaybackFields} */
	const fields = {}
	if (!source) return fields
	for (const key of Object.keys(BROADCAST_STATE_DEFAULTS)) {
		if (source[key] != null) fields[key] = source[key]
	}
	return fields
}

/**
 * Compose one deck's outbound BroadcastDeckState: index/track_id, the shared
 * playback field defaults, values picked off the deck, and the ephemeral
 * track payload (empty object when the track is already in the DB).
 * @param {number} index
 * @param {string | null} trackId
 * @param {BroadcastPlaybackFields | null | undefined} deck
 * @param {{track_url?: string | null, track_title?: string | null, track_media_id?: string | null}} ephemeralPayload
 */
export function composeBroadcastDeckState(index, trackId, deck, ephemeralPayload) {
	return {
		index,
		track_id: trackId,
		...BROADCAST_STATE_DEFAULTS,
		...pickBroadcastFields(deck),
		...ephemeralPayload
	}
}

/**
 * Calculate expected playback position for a broadcast listener.
 * Accounts for playback speed, seek position, and time elapsed.
 *
 * @param {BroadcastPlaybackFields} broadcast
 * @param {Partial<Track>} track
 * @returns {number|undefined}
 */
export function calculateSeekTime(broadcast, track) {
	const speed = broadcast.speed ?? 1
	if (broadcast.seek_position != null) {
		if (broadcast.seeked_at) {
			const elapsed = (Date.now() - new Date(broadcast.seeked_at).getTime()) / 1000
			if (elapsed < 0) return undefined
			const base = broadcast.is_playing
				? broadcast.seek_position + elapsed * speed
				: broadcast.seek_position
			if (track.duration && base >= track.duration) return undefined
			return Math.round(base)
		}
		return Math.round(broadcast.seek_position)
	}
	if (!broadcast.track_played_at) return undefined
	const elapsed = (Date.now() - new Date(broadcast.track_played_at).getTime()) / 1000
	if (elapsed < 0) return undefined
	if (track.duration && elapsed * speed >= track.duration) return undefined
	return Math.round(elapsed * speed)
}

/*
 * Ephemeral tracks — Discogs matches and local-file imports use synthetic,
 * non-UUID IDs; listeners can't look those up by id, so the broadcaster ships
 * url/title/media_id alongside and the listener reconstructs a Track.
 */

/** @type {EphemeralPayload} */
const EMPTY = {track_url: null, track_title: null, track_media_id: null}

/**
 * @param {Partial<Track> | null | undefined} track
 * @returns {EphemeralPayload}
 */
export function packEphemeralTrack(track) {
	if (!track?.id || isDbId(track.id)) return EMPTY
	return {
		track_url: track.url ?? null,
		track_title: track.title ?? null,
		track_media_id: track.media_id ?? null
	}
}

/**
 * @param {string | null | undefined} track_id
 * @param {Partial<EphemeralPayload> | null | undefined} payload
 * @returns {Track | undefined}
 */
export function unpackEphemeralTrack(track_id, payload) {
	if (!track_id || !payload?.track_url) return undefined
	const parsed = parseUrl(payload.track_url)
	const now = new Date().toISOString()
	return /** @type {Track} */ ({
		id: track_id,
		url: payload.track_url,
		title: payload.track_title ?? track_id,
		media_id: payload.track_media_id ?? parsed?.id ?? null,
		provider: parsed?.provider ?? null,
		created_at: now,
		updated_at: now,
		slug: null
	})
}
