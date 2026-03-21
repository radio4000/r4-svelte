/**
 * Auto-radio: deterministic "live radio" playback engine.
 *
 * All users with the same track list hear the same track at the same offset
 * at the same real-world time, without any server clock sync.
 *
 * Weekly shuffle rotates every Sunday 00:00 UTC using a seeded PRNG so the
 * order is identical for every client within the same week.
 */

import {shuffleArray} from '$lib/utils'
import type {Track} from '$lib/types'

/** A Track with a guaranteed duration — the subset auto-radio can work with. */
export type AutoTrack = Track & {duration: number}

export interface PlaybackSnapshot {
	trackIndex: number
	currentTrack: AutoTrack
	offsetSeconds: number
	nextTrack: AutoTrack
	secondsUntilNextTrack: number
}

export interface WeeklyShuffleResult {
	tracks: AutoTrack[]
	totalDuration: number
}

/** Seeded PRNG (mulberry32 — fast, good distribution, 32-bit state) */
function mulberry32(seed: number): () => number {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let z = Math.imul(s ^ (s >>> 15), 1 | s)
		z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) >>> 0
		return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
	}
}

/** Mix/hash an integer seed for better entropy before feeding to PRNG. */
function hashSeed(n: number): number {
	let h = n >>> 0
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
	return h ^ (h >>> 16)
}

/** Returns the number of complete Sunday-aligned weeks since the Unix epoch. */
function sundayWeekNumber(nowMs: number): number {
	// Unix epoch (1970-01-01) was a Thursday. Offset to align to Sunday.
	const EPOCH_DAY_OF_WEEK = 4 // Thursday
	const msPerWeek = 7 * 24 * 60 * 60 * 1000
	const offsetMs = EPOCH_DAY_OF_WEEK * 24 * 60 * 60 * 1000
	return Math.floor((nowMs + offsetMs) / msPerWeek)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Filter tracks to those with a known duration > 0 and a non-empty url. */
export function toAutoTracks(tracks: Track[]): AutoTrack[] {
	return tracks.filter((t): t is AutoTrack => !!t.duration && t.duration > 0 && !!t.url)
}

/** Default minimum share of tracks that need duration metadata to enable auto-radio UI actions. */
export const AUTO_RADIO_DURATION_COVERAGE_THRESHOLD = 0.5

/**
 * Whether a track list has enough duration coverage for auto-radio actions.
 * Returns false for empty lists.
 */
export function hasAutoRadioCoverage(
	tracks: Track[],
	threshold = AUTO_RADIO_DURATION_COVERAGE_THRESHOLD
): boolean {
	if (!tracks.length) return false
	const clampedThreshold = Math.min(1, Math.max(0, threshold))
	return toAutoTracks(tracks).length / tracks.length >= clampedThreshold
}

/** Derive epoch from oldest track's created_at. Returns unix seconds, or 0 if empty. */
export function epochFromTracks(tracks: Pick<Track, 'created_at'>[]): number {
	if (!tracks.length) return 0
	let oldest = tracks[0].created_at
	for (let i = 1; i < tracks.length; i++) {
		if (tracks[i].created_at < oldest) oldest = tracks[i].created_at
	}
	return Math.floor(new Date(oldest).getTime() / 1000)
}

/** DJB2 string hash — fast, deterministic, 32-bit unsigned. */
export function hashString(s: string): number {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
	return h
}

/**
 * Deterministic weekly shuffle.
 * All clients with the same inputs and the same wall-clock week return the
 * same ordered list. An optional `viewSeed` differentiates shuffles for
 * different view filters (e.g. tag subsets) of the same channel.
 */
export function weeklyShuffle(
	tracks: AutoTrack[],
	rotationStartUnix: number,
	nowMs: number,
	viewSeed?: string
): WeeklyShuffleResult {
	// Sort by id before shuffling so the result is independent of input order.
	// Different clients may receive tracks in different collection order (network/cache),
	// but as long as the track set is identical, the sort ensures the same shuffle.
	const valid = toAutoTracks(tracks).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	const week = sundayWeekNumber(nowMs)
	const rawSeed = rotationStartUnix + week + (viewSeed ? hashString(viewSeed) : 0)
	const seed = hashSeed(rawSeed)
	const rand = mulberry32(seed)
	const shuffled = shuffleArray(valid, rand)
	const totalDuration = shuffled.reduce((sum, t) => sum + t.duration, 0)
	return {tracks: shuffled, totalDuration}
}

/**
 * Compute the deterministic playback state at a given moment.
 *
 * Returns null when the track list is empty or total duration is zero.
 */
export function playbackState(
	tracks: AutoTrack[],
	totalDuration: number,
	rotationStartUnix: number,
	nowMs: number
): PlaybackSnapshot | null {
	if (!tracks.length || totalDuration <= 0) return null

	const nowUnix = nowMs / 1000
	const elapsed = nowUnix - rotationStartUnix
	// Wrap elapsed into [0, totalDuration)
	const position = ((elapsed % totalDuration) + totalDuration) % totalDuration

	let acc = 0
	let trackIndex = 0
	for (let i = 0; i < tracks.length; i++) {
		const end = acc + tracks[i].duration
		if (position < end) {
			trackIndex = i
			break
		}
		acc = end
		trackIndex = i // will be overwritten on next iteration, or stays as last
	}

	const currentTrack = tracks[trackIndex]
	const offsetSeconds = position - acc
	const secondsUntilNextTrack = currentTrack.duration - offsetSeconds
	const nextTrack = tracks[(trackIndex + 1) % tracks.length]

	return {
		trackIndex,
		currentTrack,
		offsetSeconds,
		nextTrack,
		secondsUntilNextTrack
	}
}

/** AutoRadio controller — stateful wrapper for use in a component */
export class AutoRadio {
	#rotationStartUnix: number
	#shuffled: AutoTrack[] = []
	#totalDuration = 0
	#week = -1

	constructor(rotationStartUnix: number) {
		this.#rotationStartUnix = rotationStartUnix
	}

	setTracks(tracks: AutoTrack[], nowMs = Date.now()): void {
		const result = weeklyShuffle(tracks, this.#rotationStartUnix, nowMs)
		this.#shuffled = result.tracks
		this.#totalDuration = result.totalDuration
		this.#week = sundayWeekNumber(nowMs)
	}

	tick(nowMs = Date.now()): PlaybackSnapshot | null {
		// Re-shuffle only when the week rolls over
		const week = sundayWeekNumber(nowMs)
		if (week !== this.#week && this.#shuffled.length > 0) {
			const result = weeklyShuffle(this.#shuffled, this.#rotationStartUnix, nowMs)
			this.#shuffled = result.tracks
			this.#totalDuration = result.totalDuration
			this.#week = week
		}
		return playbackState(this.#shuffled, this.#totalDuration, this.#rotationStartUnix, nowMs)
	}
}
