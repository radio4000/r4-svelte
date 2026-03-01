export function uuid() {
	return crypto.randomUUID()
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
 * Regex for matching hashtags and mentions - shared across components
 */
export const ENTITY_REGEX = /(^|\s)([#﹟＃@][\p{XID_Continue}\p{Extended_Pictographic}\p{Emoji_Component}_+-]+)/giu

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
export async function generateFrequency(channelName: string, channelSlug: string, minFreq: number, maxFreq: number) {
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
	const baseUrl = 'https://res.cloudinary.com/radio4000/image/upload'
	return `${baseUrl}/w_${size},h_${size},c_thumb,q_${quality},fl_awebp/${id}.${format}`
}

/** YouTube thumbnail URL for a track. Size: default, mqdefault, hqdefault, sddefault, maxresdefault */
export function trackImageUrl(mediaId: string, size: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'mqdefault') {
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
export function getChannelTags(tracks: Array<{tags?: string[] | null}>): Array<{value: string; count: number}> {
	return countStrings(tracks.flatMap((t) => t.tags ?? []))
}

/** Deduplicate an array of objects by their `id` field, keeping the first occurrence. */
export function dedupeById<T extends {id: string | null}>(rows: T[]): T[] {
	const seen = new Map<string, T>()
	for (const row of rows) {
		if (row?.id && !seen.has(row.id)) seen.set(row.id, row)
	}
	return [...seen.values()]
}
