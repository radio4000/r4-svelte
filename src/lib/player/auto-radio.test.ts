import {describe, expect, it} from 'vitest'
import {
	toAutoTracks,
	hasAutoRadioCoverage,
	weeklyShuffle,
	playbackState,
	hashString,
	epochFromTracks,
	type AutoTrack
} from './auto-radio'
import type {Track} from '$lib/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROTATION_START = 1_700_000_000 // arbitrary fixed epoch (seconds)

function makeTrack(i: number, overrides?: Partial<Track>): Track {
	return {
		id: `t${i}`,
		url: `https://example.com/${i}`,
		duration: 60 + i,
		title: `Track ${i}`,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		...overrides
	} as Track
}

function makeTracks(n: number): AutoTrack[] {
	return Array.from({length: n}, (_, i) => makeTrack(i)) as AutoTrack[]
}

// A Monday 2024-01-08 12:00:00 UTC (ms)
const WEEK_A_MS = new Date('2024-01-08T12:00:00Z').getTime()
// The following Monday 2024-01-15 12:00:00 UTC — different week
const WEEK_B_MS = new Date('2024-01-15T12:00:00Z').getTime()
// Same week as A, different day/time
const WEEK_A_LATER_MS = new Date('2024-01-10T23:59:59Z').getTime()
// Same week as A, different timezone offset (UTC+9, same instant)
const WEEK_A_TZ_MS = WEEK_A_MS // UTC timestamps are timezone-agnostic

// ---------------------------------------------------------------------------
// toAutoTracks
// ---------------------------------------------------------------------------

describe('toAutoTracks', () => {
	it('removes tracks with duration <= 0', () => {
		const tracks = [
			makeTrack(0, {duration: 0}),
			makeTrack(1, {duration: -5}),
			makeTrack(2, {duration: 30})
		]
		expect(toAutoTracks(tracks).map((t) => t.id)).toEqual(['t2'])
	})

	it('removes tracks without duration', () => {
		const tracks = [makeTrack(0, {duration: undefined}), makeTrack(1, {duration: 30})]
		expect(toAutoTracks(tracks).map((t) => t.id)).toEqual(['t1'])
	})

	it('removes tracks with empty url', () => {
		const tracks = [makeTrack(0, {url: ''}), makeTrack(1, {url: 'https://x.com'})]
		expect(toAutoTracks(tracks).map((t) => t.id)).toEqual(['t1'])
	})

	it('preserves track identity (id)', () => {
		const tracks = makeTracks(5)
		const out = toAutoTracks(tracks)
		expect(out.map((t) => t.id)).toEqual(tracks.map((t) => t.id))
	})
})

describe('hasAutoRadioCoverage', () => {
	it('returns false for empty track lists', () => {
		expect(hasAutoRadioCoverage([])).toBe(false)
	})

	it('returns true at exactly 50% coverage', () => {
		const tracks = [makeTrack(0, {duration: 0}), makeTrack(1, {duration: 30})]
		expect(hasAutoRadioCoverage(tracks)).toBe(true)
	})

	it('returns false below 50% coverage', () => {
		const tracks = [
			makeTrack(0, {duration: 0}),
			makeTrack(1, {duration: 0}),
			makeTrack(2, {duration: 30})
		]
		expect(hasAutoRadioCoverage(tracks)).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// weeklyShuffle — determinism
// ---------------------------------------------------------------------------

describe('weeklyShuffle — determinism', () => {
	it('same inputs + same timestamp => same order', () => {
		const tracks = makeTracks(10)
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		expect(r1.tracks.map((t) => t.id)).toEqual(r2.tracks.map((t) => t.id))
	})

	it('same week, different times within week => same order', () => {
		const tracks = makeTracks(10)
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_LATER_MS)
		expect(r1.tracks.map((t) => t.id)).toEqual(r2.tracks.map((t) => t.id))
	})

	it('same week across timezones => same order (timestamps are UTC)', () => {
		const tracks = makeTracks(10)
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_TZ_MS)
		expect(r1.tracks.map((t) => t.id)).toEqual(r2.tracks.map((t) => t.id))
	})

	it('different weeks => different order (with overwhelming probability)', () => {
		const tracks = makeTracks(10)
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_B_MS)
		// A different order is astronomically likely for 10 tracks
		expect(r1.tracks.map((t) => t.id)).not.toEqual(r2.tracks.map((t) => t.id))
	})

	it('same tracks in different input order => same shuffle (cross-client determinism)', () => {
		const tracks = makeTracks(10)
		const reversed = tracks.toReversed()
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const r2 = weeklyShuffle(reversed, ROTATION_START, WEEK_A_MS)
		expect(r1.tracks.map((t) => t.id)).toEqual(r2.tracks.map((t) => t.id))
	})

	it('no missing or duplicate tracks after shuffle', () => {
		const tracks = makeTracks(20)
		const {tracks: shuffled} = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		expect(shuffled.length).toBe(tracks.length)
		expect(new Set(shuffled.map((t) => t.id)).size).toBe(tracks.length)
	})

	it('totalDuration equals sum of all track durations', () => {
		const tracks = makeTracks(5)
		const expected = tracks.reduce((s, t) => s + t.duration, 0)
		const {totalDuration} = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		expect(totalDuration).toBe(expected)
	})
})

// ---------------------------------------------------------------------------
// playbackState
// ---------------------------------------------------------------------------

describe('playbackState', () => {
	const tracks = makeTracks(5) // durations: 60, 61, 62, 63, 64 => total 310
	const total = tracks.reduce((s, t) => s + t.duration, 0) // 310

	it('returns null for empty track list', () => {
		expect(playbackState([], 0, ROTATION_START, WEEK_A_MS)).toBeNull()
	})

	it('returns null when totalDuration is 0', () => {
		expect(playbackState(tracks, 0, ROTATION_START, WEEK_A_MS)).toBeNull()
	})

	it('first track at rotation start (position 0)', () => {
		const nowMs = ROTATION_START * 1000 // elapsed = 0
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.trackIndex).toBe(0)
		expect(snap.currentTrack.id).toBe('t0')
		expect(snap.offsetSeconds).toBeCloseTo(0, 5)
	})

	it('correct track and offset mid-sequence', () => {
		// position = 60 (end of t0) => start of t1
		const nowMs = (ROTATION_START + 60) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.currentTrack.id).toBe('t1')
		expect(snap.offsetSeconds).toBeCloseTo(0, 5)
	})

	it('correct offset within a track', () => {
		// position = 90 => 30s into t1 (which starts at 60)
		const nowMs = (ROTATION_START + 90) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.currentTrack.id).toBe('t1')
		expect(snap.offsetSeconds).toBeCloseTo(30, 5)
	})

	it('loop: after last track, wraps to first', () => {
		// position = total => wraps to 0 => first track
		const nowMs = (ROTATION_START + total) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.trackIndex).toBe(0)
		expect(snap.currentTrack.id).toBe('t0')
	})

	it('nextTrack is first track when current is last', () => {
		// position just inside last track (t4 starts at 60+61+62+63=246)
		const nowMs = (ROTATION_START + 246 + 1) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.currentTrack.id).toBe('t4')
		expect(snap.nextTrack.id).toBe('t0')
	})

	it('secondsUntilNextTrack is positive and <= current track duration', () => {
		const nowMs = (ROTATION_START + 90) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		if (!snap) return
		expect(snap.secondsUntilNextTrack).toBeGreaterThan(0)
		expect(snap.secondsUntilNextTrack).toBeLessThanOrEqual(snap.currentTrack.duration)
	})

	it('works correctly for elapsed time before rotation start (negative elapsed)', () => {
		// Should still return a valid state (modulo wraps correctly)
		const nowMs = (ROTATION_START - 100) * 1000
		const snap = playbackState(tracks, total, ROTATION_START, nowMs)
		expect(snap).not.toBeNull()
		expect(snap?.offsetSeconds).toBeGreaterThanOrEqual(0)
	})
})

// ---------------------------------------------------------------------------
// weeklyShuffle — viewSeed
// ---------------------------------------------------------------------------

describe('weeklyShuffle — viewSeed', () => {
	const tracks = makeTracks(10)

	it('same tracks + same viewSeed + same time => same shuffle', () => {
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'house')
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'house')
		expect(r1.tracks.map((t) => t.id)).toEqual(r2.tracks.map((t) => t.id))
	})

	it('different viewSeed => different shuffle', () => {
		const r1 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'house')
		const r2 = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'techno')
		expect(r1.tracks.map((t) => t.id)).not.toEqual(r2.tracks.map((t) => t.id))
	})

	it('no viewSeed => original behavior (different from any viewSeed)', () => {
		const withoutSeed = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const withSeed = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'house')
		expect(withoutSeed.tracks.map((t) => t.id)).not.toEqual(withSeed.tracks.map((t) => t.id))
	})

	it('viewSeed does not change track count or total duration', () => {
		const withoutSeed = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS)
		const withSeed = weeklyShuffle(tracks, ROTATION_START, WEEK_A_MS, 'ambient')
		expect(withSeed.tracks.length).toBe(withoutSeed.tracks.length)
		expect(withSeed.totalDuration).toBe(withoutSeed.totalDuration)
	})
})

// ---------------------------------------------------------------------------
// epochFromTracks
// ---------------------------------------------------------------------------

describe('epochFromTracks', () => {
	it('returns 0 for empty array', () => {
		expect(epochFromTracks([])).toBe(0)
	})

	it('returns unix seconds of the oldest track', () => {
		const tracks = [
			{created_at: '2024-06-15T00:00:00Z'},
			{created_at: '2023-01-01T00:00:00Z'},
			{created_at: '2024-12-01T00:00:00Z'}
		]
		expect(epochFromTracks(tracks)).toBe(
			Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000)
		)
	})

	it('is stable regardless of input order', () => {
		const tracks = [
			{created_at: '2024-06-15T00:00:00Z'},
			{created_at: '2023-01-01T00:00:00Z'},
			{created_at: '2024-12-01T00:00:00Z'}
		]
		expect(epochFromTracks(tracks)).toBe(epochFromTracks(tracks.toReversed()))
	})
})

// ---------------------------------------------------------------------------
// hashString
// ---------------------------------------------------------------------------

describe('hashString', () => {
	it('is deterministic', () => {
		expect(hashString('house')).toBe(hashString('house'))
	})

	it('different strings => different hashes', () => {
		expect(hashString('house')).not.toBe(hashString('techno'))
	})

	it('returns a number', () => {
		expect(typeof hashString('test')).toBe('number')
	})
})
