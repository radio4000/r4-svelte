/**
 * Pure utilities for broadcast sync calculations.
 * No external deps — safe to import in tests.
 */

/** @typedef {import('$lib/types').BroadcastDeckState} BroadcastDeckState */
/** @typedef {import('$lib/types').Track} Track */

/** Shared drift tolerance used by both broadcast and auto-radio drift effects. */
export const DRIFT_TOLERANCE_SECONDS = 2

/**
 * Calculate expected playback position for a broadcast listener.
 * Accounts for playback speed, seek position, and time elapsed.
 *
 * @param {Partial<BroadcastDeckState> & {track_played_at?: string | null}} broadcast
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
