export function uuid() {
	return self.crypto.randomUUID()
}

export async function delay(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

export function trimWithEllipsis(text?: string | null, maxLength: number = 267) {
	return !text || text.length <= maxLength ? text || '' : `${text.substring(0, maxLength)}…`
}

export function parseSearchTokens(query) {
	const mentions = query.match(/@\w+/g) || []
	const cleanQuery = query.replace(/@\w+/g, '').trim()
	return {
		text: cleanQuery,
		mentions: mentions.map((m) => m.slice(1)) // remove @
	}
}

export function extractYouTubeId(url) {
	const patterns = [
		/(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\/?\?(?:\S*?&?v=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/
	]
	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match) return match[1]
	}
	return null
}

export function detectMediaProvider(url: string): 'youtube' | 'soundcloud' | null {
	if (!url) return null
	if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
	if (url.includes('soundcloud.com')) return 'soundcloud'
	return null
}

/** Takes an array and returns a shuffled version.Uses http://bost.ocks.org/mike/shuffle/ */
export function shuffleArray<T>(arr: Array<T>) {
	// Return a new array.
	const array = arr.slice()

	let m = array.length
	let t: T
	let i: number

	// While there remain elements to shuffle…
	while (m) {
		// Pick a remaining element…
		i = Math.floor(Math.random() * m--)

		// And swap it with the current element.
		t = array[m]
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
	const durationMs = now - startTime

	if (durationMs < 60000) return 'just started'
	if (durationMs < 3600000) return `${Math.floor(durationMs / 60000)}m ago`

	const hours = Math.floor(durationMs / 3600000)
	const minutes = Math.floor((durationMs % 3600000) / 60000)
	return `${hours}h ${minutes}m ago`
}
