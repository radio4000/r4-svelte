import {describe, expect, test} from 'vitest'
import {calculateSeekTime} from '$lib/player/broadcast-utils'

/** @typedef {import('$lib/types').Track} Track */

/** @param {Partial<Track>} overrides */
function makeTrack(overrides = {}) {
	return /** @type {Track} */ ({id: 'track-1', duration: 300, slug: 'test', ...overrides})
}

describe('calculateSeekTime', () => {
	test('returns undefined when no timing info', () => {
		const broadcast = {}
		expect(calculateSeekTime(broadcast, makeTrack())).toBeUndefined()
	})

	test('returns seek_position when no seeked_at', () => {
		const broadcast = {seek_position: 42}
		expect(calculateSeekTime(broadcast, makeTrack())).toBe(42)
	})

	test('returns static seek_position (paused) with seeked_at but is_playing=false', () => {
		const broadcast = {
			seek_position: 50,
			seeked_at: new Date(Date.now() - 10_000).toISOString(),
			is_playing: false
		}
		// Paused: position doesn't advance
		expect(calculateSeekTime(broadcast, makeTrack())).toBe(50)
	})

	test('advances position by elapsed time when is_playing=true', () => {
		const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
		const broadcast = {
			seek_position: 20,
			seeked_at: tenSecondsAgo,
			is_playing: true,
			speed: 1
		}
		const result = calculateSeekTime(broadcast, makeTrack())
		// 20 + 10s elapsed = 30 (rounded)
		expect(result).toBeCloseTo(30, 0)
	})

	test('accounts for playback speed when advancing', () => {
		const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
		const broadcast = {
			seek_position: 20,
			seeked_at: tenSecondsAgo,
			is_playing: true,
			speed: 2
		}
		// 20 + 10s * 2x = 40
		const result = calculateSeekTime(broadcast, makeTrack())
		expect(result).toBeCloseTo(40, 0)
	})

	test('returns undefined if advanced position exceeds track duration', () => {
		const longAgo = new Date(Date.now() - 400_000).toISOString()
		const broadcast = {
			seek_position: 0,
			seeked_at: longAgo,
			is_playing: true,
			speed: 1
		}
		// 400s elapsed > 300s duration
		expect(calculateSeekTime(broadcast, makeTrack({duration: 300}))).toBeUndefined()
	})

	test('uses track_played_at when no seek_position', () => {
		const twentySecondsAgo = new Date(Date.now() - 20_000).toISOString()
		const broadcast = {track_played_at: twentySecondsAgo}
		const result = calculateSeekTime(broadcast, makeTrack())
		expect(result).toBeCloseTo(20, 0)
	})

	test('accounts for speed with track_played_at', () => {
		const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
		const broadcast = {track_played_at: tenSecondsAgo, speed: 1.5}
		// 10s * 1.5x = 15s
		const result = calculateSeekTime(broadcast, makeTrack())
		expect(result).toBeCloseTo(15, 0)
	})

	test('returns undefined if track_played_at is in future', () => {
		const inFuture = new Date(Date.now() + 5_000).toISOString()
		const broadcast = {track_played_at: inFuture}
		expect(calculateSeekTime(broadcast, makeTrack())).toBeUndefined()
	})

	test('returns undefined if elapsed via track_played_at exceeds duration', () => {
		const wayBack = new Date(Date.now() - 600_000).toISOString()
		const broadcast = {track_played_at: wayBack}
		expect(calculateSeekTime(broadcast, makeTrack({duration: 300}))).toBeUndefined()
	})

	test('ignores duration check when track has no duration', () => {
		const longAgo = new Date(Date.now() - 400_000).toISOString()
		const broadcast = {track_played_at: longAgo}
		// No duration — should return the elapsed value rather than undefined
		const result = calculateSeekTime(broadcast, makeTrack({duration: undefined}))
		expect(typeof result).toBe('number')
	})

	test('returns undefined if seeked_at is in future', () => {
		const broadcast = {
			seek_position: 10,
			seeked_at: new Date(Date.now() + 5_000).toISOString(),
			is_playing: true
		}
		expect(calculateSeekTime(broadcast, makeTrack())).toBeUndefined()
	})
})
