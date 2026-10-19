import type {ReadonlyURL} from '$app/state'
import fuzzysort from 'fuzzysort'
import {parseUrl} from 'media-now'
import {appCloudinaryUrl, MOBILE_BREAKPOINT} from '#lib/config.js'
import * as m from '#lib/paraglide/messages.js'

export function uuid() {
	return crypto.randomUUID()
}

/** Short, URL-friendly seed for deterministic shuffles. */
export function shuffleSeed(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** Matches the app's mobile CSS breakpoint (deck strip, layout header). */
export function isMobileViewport(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
	)
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true if the string is a valid UUID (i.e. a real DB-persisted record ID, not an ephemeral one). */
export function isDbId(id: string | null | undefined): boolean {
	return Boolean(id && RE_UUID.test(id))
}

export function canonicalTrackKey(track: {
	provider?: string | null
	media_id?: string | null
	url?: string | null
}): string | null {
	if (track.provider && track.media_id) return `${track.provider}:${track.media_id}`

	try {
		const parsed = parseUrl(track.url ?? '')
		const provider = parsed?.provider ?? null
		const mediaId = parsed?.id ?? null
		if (provider && mediaId) return `${provider}:${mediaId}`
	} catch {
		// Fall back to normalized raw URL below.
	}

	const raw = (track.url ?? '').trim()
	if (!raw) return null
	try {
		const url = new URL(raw)
		url.hash = ''
		return `${url.origin}${url.pathname}${url.search}`.toLowerCase()
	} catch {
		return raw.toLowerCase()
	}
}

const RE_DIACRITICS = /[\u0300-\u036f]/g
const RE_NON_ALNUM = /[^a-z0-9 -]/g
const RE_WHITESPACE = /\s+/g
const RE_MULTI_DASH = /-+/g

export function slugify(str: string): string {
	return String(str)
		.normalize('NFKD')
		.replace(RE_DIACRITICS, '')
		.trim()
		.toLowerCase()
		.replace(RE_NON_ALNUM, '')
		.replace(RE_WHITESPACE, '-')
		.replace(RE_MULTI_DASH, '-')
}

/** Promise that resolves after `ms` milliseconds. */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Random delay between min and max milliseconds */
export function delayRandom(min: number, max: number): Promise<void> {
	return delay(Math.random() * (max - min) + min)
}

/** Delay with jitter: base ± (base * jitter) */
export function delayWithJitter(base: number, jitter: number = 0.2): Promise<void> {
	const variance = base * jitter
	return delay(base + (Math.random() * 2 - 1) * variance)
}

export function trimWithEllipsis(text?: string | null, maxLength: number = 267) {
	return !text || text.length <= maxLength ? text || '' : `${text.substring(0, maxLength)}…`
}

/** Fisher-Yates shuffle. Pass a custom `rand` for deterministic (seeded) shuffles. */
export function shuffleArray<T>(arr: Array<T>, rand: () => number = Math.random): Array<T> {
	const array = arr.slice()
	let m = array.length
	while (m) {
		const i = Math.floor(rand() * m--)
		const t = array[m]
		array[m] = array[i]
		array[i] = t
	}
	return array
}

/**
 * Deterministic PRNG factory from a string seed.
 * Returns numbers in [0, 1), suitable for `shuffleArray`.
 */
export function seededRandom(seed: string): () => number {
	let h = 1779033703 ^ seed.length
	for (let i = 0; i < seed.length; i += 1) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
		h = (h << 13) | (h >>> 19)
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507)
		h = Math.imul(h ^ (h >>> 13), 3266489909)
		h ^= h >>> 16
		return (h >>> 0) / 4294967296
	}
}

/**
 * Regex for matching hashtags and mentions - shared across components
 */
export const ENTITY_REGEX =
	/(^|\s)([#﹟＃@][\p{XID_Continue}\p{Extended_Pictographic}\p{Emoji_Component}_+-]+)/giu

export const HASH_PREFIX_REGEX = /^#/

/**
 * Parse text for entities (hashtags and mentions), invoking `callback` per match.
 * Falsy callback results are dropped from the returned array.
 */
export function parseEntities<T>(
	text: string,
	callback: (match: string, prefix: string, entity: string, offset: number) => T
): T[] {
	if (!text || typeof text !== 'string') return []

	const entities: T[] = []
	text.replace(ENTITY_REGEX, (match, prefix, entity, offset) => {
		entities.push(callback(match, prefix, entity, offset))
		return match
	})

	return entities.filter(Boolean)
}

/**
 * Extract hashtags from text
 */
export function extractHashtags(text: string): string[] {
	return parseEntities(text, (_match, _prefix, entity) =>
		entity.startsWith('#') ? entity.toLowerCase() : ''
	)
}

/**
 * Extract mentions from text
 */
export function extractMentions(text: string): string[] {
	return parseEntities(text, (_match, _prefix, entity) =>
		entity.startsWith('@') ? entity.toLowerCase() : ''
	)
}

/**
 * Build a Cloudinary URL for a channel avatar image
 * @param {string} id - Cloudinary image ID
 * @param {number} [size=250] - Image dimensions (square)
 * @param {string} [format='webp'] - Image format
 * @param {number} [quality=60] - Image quality (1-100)
 */
export function channelAvatarUrl(id: string, size = 250, format = 'webp', quality = 60) {
	return `${appCloudinaryUrl}/image/upload/w_${size},h_${size},c_thumb,q_${quality},fl_awebp/${id}.${format}`
}

/**
 * Build a Cloudinary URL for a channel image at its original aspect ratio
 * (width-constrained, no square crop) — for display contexts like album art.
 * @param {string} id - Cloudinary image ID
 * @param {number} [width=500] - Max width, height scales to preserve aspect ratio
 * @param {string} [format='webp'] - Image format
 * @param {number} [quality=70] - Image quality (1-100)
 */
export function channelImageUrl(id: string, width = 500, format = 'webp', quality = 70) {
	return `${appCloudinaryUrl}/image/upload/w_${width},c_limit,q_${quality},fl_awebp/${id}.${format}`
}

/** YouTube thumbnail URL for a track. Size: default, mqdefault, hqdefault, sddefault, maxresdefault */
export function trackImageUrl(
	mediaId: string,
	size: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'mqdefault'
) {
	return `https://i.ytimg.com/vi/${mediaId}/${size}.jpg`
}

/** Parse 1-based `page`/`per` pagination search params, clamping to positive ints. */
export function paginationFromUrl(url: ReadonlyURL, defaultPer = 50): {page: number; per: number} {
	const positive = (value: string | null, fallback: number) =>
		Math.max(1, parseInt(value ?? '', 10) || fallback)
	return {
		page: positive(url.searchParams.get('page'), 1),
		per: positive(url.searchParams.get('per'), defaultPer)
	}
}

/**
 * Count string occurrences and sort by count (desc), then alphabetically.
 * @example
 * countStrings(['rock', 'jazz', 'rock', 'blues', 'jazz', 'jazz'])
 * // => [{value: 'jazz', count: 3}, {value: 'rock', count: 2}, {value: 'blues', count: 1}]
 */
export function countStrings(strings: string[]): Array<{value: string; count: number}> {
	const counts: Record<string, number> = {}
	for (const s of strings) {
		const key = s.toLowerCase()
		counts[key] = (counts[key] || 0) + 1
	}
	return Object.entries(counts)
		.map(([value, count]) => ({value, count}))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Aggregate and count tags from an array of tracks. */
export function getChannelTags(
	tracks: Array<{tags?: string[] | null}>
): Array<{value: string; count: number}> {
	return countStrings(tracks.flatMap((t) => t.tags ?? []))
}

/** Top channel slugs sorted by track count + recency. */
export function getTopChannelSlugs(
	channels: Iterable<{
		slug?: string | null
		track_count?: number | null
		latest_track_at?: string | null
	}>,
	limit: number
): string[] {
	return [...channels]
		.filter((c) => c?.slug)
		.toSorted(
			(a, b) =>
				(b.track_count ?? 0) - (a.track_count ?? 0) ||
				(b.latest_track_at ?? '').localeCompare(a.latest_track_at ?? '')
		)
		.slice(0, limit)
		.map((c) => c.slug as string)
}

/**
 * Score a channel for "featured" ranking.
 * Higher = more interesting. Used client-side to sort a quality pool.
 */
export function featuredScore(channel: {
	followers?: unknown[] | null
	track_count?: number | null
	latest_track_at?: string | null
}): number {
	const followers = Array.isArray(channel.followers) ? channel.followers.length : 0
	const tracks = channel.track_count ?? 0
	const latest = channel.latest_track_at
	let recency = 0
	if (latest) {
		const days = (Date.now() - new Date(latest).getTime()) / 86400000
		if (days <= 30) recency = 3
		else if (days <= 90) recency = 2
		else if (days <= 180) recency = 1
	}
	return followers * 3 + Math.log(tracks + 1) * 2 + recency
}

/** Format a YYYY-MM-DD ISO date string as a human-readable day label. */
export function formatDay(iso: string): string {
	const date = new Date(`${iso}T00:00:00`)
	const today = new Date()
	const todayIso = today.toISOString().slice(0, 10)
	const yesterdayIso = new Date(today.getTime() - 86400000).toISOString().slice(0, 10)
	if (iso === todayIso) return m.day_today()
	if (iso === yesterdayIso) return m.day_yesterday()
	const opts: Intl.DateTimeFormatOptions = {month: 'long', day: 'numeric'}
	if (iso.slice(0, 4) !== todayIso.slice(0, 4)) opts.year = 'numeric'
	return date.toLocaleDateString(undefined, opts)
}

/** Group an array of tracks by creation day, returning [{label, tracks}]. */
export function groupByDay<T extends {created_at?: string | null}>(
	tracks: T[]
): {label: string; tracks: T[]}[] {
	const map = new Map<string, T[]>()
	for (const track of tracks) {
		const day = track.created_at?.slice(0, 10) ?? ''
		if (!map.has(day)) map.set(day, [])
		map.get(day)?.push(track)
	}
	return Array.from(map.entries(), ([day, items]) => ({
		label: day ? formatDay(day) : '—',
		tracks: items
	}))
}

/** Deduplicate an array of objects by their `id` field, keeping the first occurrence. */
export function dedupeById<T extends {id: string | null}>(rows: T[]): T[] {
	const seen = new Map<string, T>()
	for (const row of rows) {
		if (row?.id && !seen.has(row.id)) seen.set(row.id, row)
	}
	return [...seen.values()]
}

/**
 * Generic fuzzy search (fuzzysort wrapper).
 */
export function fuzzySearch<T>(
	query: string,
	items: T[],
	keys: string[],
	{limit = 100, threshold = 0.5} = {}
): T[] {
	if (!query?.trim()) return items
	return fuzzysort.go(query, items, {keys, limit, threshold}).map((r) => r.obj)
}

/**
 * Seconds of listening required before a play counts (Last.fm scrobble rule).
 * Full track if under 2 minutes; otherwise half the duration, capped at 4 minutes.
 * Unknown duration falls back to the 4-minute cap.
 */
export function getPlayCountThreshold(durationSec?: number | null): number {
	if (!durationSec) return 240
	if (durationSec < 120) return durationSec
	return Math.min(durationSec / 2, 240)
}
