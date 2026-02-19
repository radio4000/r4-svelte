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

export interface AutoRadioTrack {
	id: string
	url: string
	duration: number
	title?: string
}

export interface PlaybackSnapshot {
	trackIndex: number
	currentTrack: AutoRadioTrack
	offsetSeconds: number
	nextTrack: AutoRadioTrack
	secondsUntilNextTrack: number
}

export interface WeeklyShuffleResult {
	tracks: AutoRadioTrack[]
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

/**
 * Validate and normalize tracks — keeps only those with duration > 0
 * and a non-empty url.
 */
export function normalizeTracks(tracks: AutoRadioTrack[]): AutoRadioTrack[] {
	return tracks.filter((t) => t.duration > 0 && t.url)
}

/**
 * Deterministic weekly shuffle.
 * All clients with the same inputs and the same wall-clock week return the
 * same ordered list.
 */
export function weeklyShuffle(tracks: AutoRadioTrack[], rotationStartUnix: number, nowMs: number): WeeklyShuffleResult {
	// Sort by id before shuffling so the result is independent of input order.
	// Different clients may receive tracks in different collection order (network/cache),
	// but as long as the track set is identical, the sort ensures the same shuffle.
	const valid = normalizeTracks(tracks).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	const week = sundayWeekNumber(nowMs)
	const rawSeed = rotationStartUnix + week
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
	tracks: AutoRadioTrack[],
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

// ---------------------------------------------------------------------------
// AutoRadio controller — stateful wrapper for use in a component
// ---------------------------------------------------------------------------

export class AutoRadio {
	#rotationStartUnix: number
	#shuffled: AutoRadioTrack[] = []
	#totalDuration = 0

	constructor(rotationStartUnix: number) {
		this.#rotationStartUnix = rotationStartUnix
	}

	setTracks(tracks: AutoRadioTrack[], nowMs = Date.now()): void {
		const result = weeklyShuffle(tracks, this.#rotationStartUnix, nowMs)
		this.#shuffled = result.tracks
		this.#totalDuration = result.totalDuration
	}

	tick(nowMs = Date.now()): PlaybackSnapshot | null {
		// Re-shuffle if the week rolled over since last setTracks call
		if (this.#shuffled.length > 0) {
			const result = weeklyShuffle(this.#shuffled, this.#rotationStartUnix, nowMs)
			// Only reassign if order actually changed (week boundary)
			if (result.totalDuration !== this.#totalDuration) {
				this.#shuffled = result.tracks
				this.#totalDuration = result.totalDuration
			}
		}
		return playbackState(this.#shuffled, this.#totalDuration, this.#rotationStartUnix, nowMs)
	}
}
