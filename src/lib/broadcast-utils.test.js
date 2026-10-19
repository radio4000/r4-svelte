import {describe, expect, test} from 'vitest'
import {
	calculateSeekTime,
	pickBroadcastFields,
	composeBroadcastDeckState
} from '#lib/broadcast-utils.js'

/** @typedef {import('#lib/types.js').Track} Track */

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

describe('pickBroadcastFields', () => {
	test('returns empty object for null/undefined source', () => {
		expect(pickBroadcastFields(null)).toEqual({})
		expect(pickBroadcastFields(undefined)).toEqual({})
	})

	test('picks only the known playback fields, dropping extras', () => {
		const source = {
			track_played_at: '2026-01-01T00:00:00.000Z',
			seeked_at: '2026-01-01T00:00:01.000Z',
			seek_position: 42,
			volume: 0.5,
			muted: true,
			is_playing: true,
			speed: 1.5,
			track_id: 'unrelated',
			index: 0
		}
		expect(pickBroadcastFields(source)).toEqual({
			track_played_at: '2026-01-01T00:00:00.000Z',
			seeked_at: '2026-01-01T00:00:01.000Z',
			seek_position: 42,
			volume: 0.5,
			muted: true,
			is_playing: true,
			speed: 1.5
		})
	})

	test('omits fields that are null or undefined on the source', () => {
		const source = {seek_position: 0, volume: 0, muted: false, is_playing: false}
		expect(pickBroadcastFields(source)).toEqual({
			seek_position: 0,
			volume: 0,
			muted: false,
			is_playing: false
		})
	})
})

describe('composeBroadcastDeckState', () => {
	test('fills in defaults for an empty/minimal deck', () => {
		const result = composeBroadcastDeckState(0, null, undefined, {})
		expect(result).toEqual({
			index: 0,
			track_id: null,
			track_played_at: null,
			seeked_at: null,
			seek_position: null,
			is_playing: false,
			volume: 0,
			muted: false,
			speed: 1
		})
	})

	test('overrides defaults with picked deck fields and merges the ephemeral payload', () => {
		const deck = {playlist_track: 'ephemeral-1', is_playing: true, volume: 0.8, speed: 1.5}
		const ephemeralPayload = {
			track_url: 'https://youtu.be/abc',
			track_title: 'Song',
			track_media_id: 'abc'
		}
		const result = composeBroadcastDeckState(2, 'ephemeral-1', deck, ephemeralPayload)
		expect(result).toEqual({
			index: 2,
			track_id: 'ephemeral-1',
			track_played_at: null,
			seeked_at: null,
			seek_position: null,
			is_playing: true,
			volume: 0.8,
			muted: false,
			speed: 1.5,
			...ephemeralPayload
		})
	})
})
