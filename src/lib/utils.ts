import fuzzysort from 'fuzzysort'
import {appCloudinaryUrl} from '$lib/config'
import * as m from '$lib/paraglide/messages'

export function uuid() {
	return crypto.randomUUID()
}

/** Short, URL-friendly seed for deterministic shuffles. */
export function shuffleSeed(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true if the string is a valid UUID (i.e. a real DB-persisted record ID, not an ephemeral one). */
export function isDbId(id: string | null | undefined): boolean {
	return Boolean(id && RE_UUID.test(id))
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

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
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

/**
 * Parse text for entities (hashtags and mentions)
 */
export function parseEntities(
	text: string,
	callback: (match: string, prefix: string, entity: string, offset: number) => unknown
): unknown[] {
	if (!text || typeof text !== 'string') return []

	const entities: unknown[] = []
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
	if (!text || typeof text !== 'string') return []

	const hashtags: string[] = []
	text.replace(ENTITY_REGEX, (match, _prefix, entity) => {
		if (entity.startsWith('#')) {
			hashtags.push(entity.toLowerCase())
		}
		return match
	})

	return hashtags
}

/**
 * Extract mentions from text
 */
export function extractMentions(text: string): string[] {
	if (!text || typeof text !== 'string') return []

	const mentions: string[] = []
	text.replace(ENTITY_REGEX, (match, _prefix, entity) => {
		if (entity.startsWith('@')) {
			mentions.push(entity.toLowerCase())
		}
		return match
	})

	return mentions
}

/**
 * Generate a unique, deterministic frequency based on the channel name and slug.
 * All frequency values are rounded to one decimal place.
 * Values are generated inside a given range.
 */
export async function generateFrequency(
	channelName: string,
	channelSlug: string,
	minFreq: number,
	maxFreq: number
) {
	// Combine the channel name and slug
	const inputString = channelName + channelSlug

	// Generate a hash of the inputString
	const encoder = new TextEncoder()
	const data = encoder.encode(inputString)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = new Uint8Array(hashBuffer)

	// Convert the hash array to a big integer
	const hashBigInt = hashArray.reduce((acc, byte) => acc * BigInt(256) + BigInt(byte), BigInt(0))

	// Scale the hash integer to the given frequency range
	const rangeSize = (maxFreq - minFreq) * 10 // Multiply by 10 to account for the decimal place
	const uniqueFreq = minFreq + Number(hashBigInt % BigInt(rangeSize)) / 10

	// Round to one decimal place
	const uniqueFreqRounded = Math.round(uniqueFreq * 10) / 10

	return uniqueFreqRounded
}

export function timeAgo(dateString: string): string {
	const now = Date.now()
	const startTime = new Date(dateString).getTime()
	const durationMs = Math.max(0, now - startTime)

	if (durationMs < 60000) return 'just started'
	if (durationMs < 3600000) return `${Math.floor(durationMs / 60000)}m ago`

	const hours = Math.floor(durationMs / 3600000)
	const minutes = Math.floor((durationMs % 3600000) / 60000)
	return `${hours}h ${minutes}m ago`
}

/** Random delay between min and max milliseconds */
export function delayRandom(min: number, max: number): Promise<void> {
	const ms = Math.random() * (max - min) + min
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Delay with jitter: base ± (base * jitter) */
export function delayWithJitter(base: number, jitter: number = 0.2): Promise<void> {
	const variance = base * jitter
	const ms = base + (Math.random() * 2 - 1) * variance
	return new Promise((resolve) => setTimeout(resolve, ms))
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

/** YouTube thumbnail URL for a track. Size: default, mqdefault, hqdefault, sddefault, maxresdefault */
export function trackImageUrl(
	mediaId: string,
	size: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'mqdefault'
) {
	return `https://i.ytimg.com/vi/${mediaId}/${size}.jpg`
}

/** Pick N random elements from array (no duplicates) */
export function pickRandomN<T>(n: number) {
	return (arr: T[]): T[] => {
		if (n >= arr.length) return [...arr]
		const copy = [...arr]
		const result: T[] = []
		for (let i = 0; i < n && copy.length > 0; i++) {
			const idx = Math.floor(Math.random() * copy.length)
			result.push(copy.splice(idx, 1)[0])
		}
		return result
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

/** Top tag values from a collection of tracks. */
export function getTopTagValues(tracks: Array<{tags?: string[] | null}>, limit: number): string[] {
	if (!tracks.length) return []
	return getChannelTags(tracks)
		.slice(0, limit)
		.map((t) => t.value)
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

export interface TagGraphNode {
	id: string
	label: string
	count: number
}

export interface TagGraphEdge {
	id: string
	source: string
	target: string
	weight: number
}

export interface TagGraph {
	nodes: TagGraphNode[]
	edges: TagGraphEdge[]
}

export interface TagGraphOptions {
	minEdgeWeight?: number
	maxTags?: number
	maxEdgesPerNode?: number
}

/**
 * Build a tag co-occurrence graph from tracks.
 * Nodes are tags (raw strings, no `#` prefix). Edges connect tags that appear on the same track.
 * Edge weight = number of tracks where both tags appear together.
 */
export function buildTagGraph(
	tracks: Array<{tags?: string[] | null}>,
	options?: TagGraphOptions
): TagGraph {
	const {minEdgeWeight = 2, maxTags = 500, maxEdgesPerNode = 20} = options ?? {}

	// Count tags
	const tagCounts: Record<string, number> = {}
	for (const track of tracks) {
		for (const tag of track.tags ?? []) {
			const key = tag.toLowerCase()
			tagCounts[key] = (tagCounts[key] || 0) + 1
		}
	}

	// Top maxTags by count
	const sorted = Object.entries(tagCounts)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxTags)
	const topTagSet = new Set(sorted.map(([t]) => t))

	const nodes: TagGraphNode[] = sorted.map(([tag, count]) => ({id: tag, label: tag, count}))

	// Co-occurrence edge weights
	const edgeWeights: Record<string, number> = {}
	for (const track of tracks) {
		const tags = [
			...new Set((track.tags ?? []).map((t) => t.toLowerCase()).filter((t) => topTagSet.has(t)))
		]
		for (let i = 0; i < tags.length; i++) {
			for (let j = i + 1; j < tags.length; j++) {
				const a = tags[i] < tags[j] ? tags[i] : tags[j]
				const b = tags[i] < tags[j] ? tags[j] : tags[i]
				const key = `${a}\0${b}`
				edgeWeights[key] = (edgeWeights[key] || 0) + 1
			}
		}
	}

	// Filter and limit edges
	const edgesPerNode: Record<string, number> = {}
	const edges: TagGraphEdge[] = []

	const sortedEdges = Object.entries(edgeWeights)
		.filter(([, w]) => w >= minEdgeWeight)
		.sort((a, b) => b[1] - a[1])

	for (const [key, weight] of sortedEdges) {
		const sep = key.indexOf('\0')
		const source = key.slice(0, sep)
		const target = key.slice(sep + 1)
		if ((edgesPerNode[source] ?? 0) >= maxEdgesPerNode) continue
		if ((edgesPerNode[target] ?? 0) >= maxEdgesPerNode) continue
		edgesPerNode[source] = (edgesPerNode[source] ?? 0) + 1
		edgesPerNode[target] = (edgesPerNode[target] ?? 0) + 1
		edges.push({id: key, source, target, weight})
	}

	// Remove isolated nodes — tags with no edges after weight/count filtering
	const connectedTags = new Set<string>()
	for (const edge of edges) {
		connectedTags.add(edge.source)
		connectedTags.add(edge.target)
	}
	const filteredNodes = nodes.filter((n) => connectedTags.has(n.id))

	return {nodes: filteredNodes, edges}
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
