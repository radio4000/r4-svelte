const splitRe = /\s+/

/**
 * @param {string | undefined | null} playlistTitle
 */
export function extractPlaylistHashtags(playlistTitle) {
	if (!playlistTitle) return []
	/** @type {string[]} */
	const tags = []
	const seen = new Set()
	for (const token of playlistTitle.split(splitRe)) {
		if (!token || !token.startsWith('#') || token.length < 2) continue
		const key = token.toLowerCase()
		if (seen.has(key)) continue
		seen.add(key)
		tags.push(token)
	}
	return tags
}

/**
 * @param {string | undefined} slug
 * @param {string | undefined} tag
 */
export function buildTagHref(slug, tag) {
	if (!slug || !tag) return undefined
	const value = tag.startsWith('#') ? tag.slice(1) : tag
	if (!value) return undefined
	return `/${slug}/tracks?tags=${encodeURIComponent(value)}`
}

/**
 * @param {string | null | undefined} trackSlug
 * @param {string | null | undefined} fallbackSlug
 */
export function getListeningWhomSlug(trackSlug, fallbackSlug) {
	return trackSlug || fallbackSlug || undefined
}

/**
 * @typedef {{
 *  title?: string
 *  slug?: string | null
 *  playlistTitle?: string | null
 *  listening?: boolean
 *  listeningWhoSlug?: string | null
 *  listeningWhomTrackSlug?: string | null
 *  listeningWhomFallbackSlug?: string | null
 *  tagBaseSlug?: string | null
 *  toHref?: ((path: string) => string) | undefined
 * }} DeckChannelHeaderStateInput
 */

/**
 * Shared state model for deck/channel headers.
 * Keeps slug/tags/listening who+whom behavior consistent across all surfaces.
 *
 * @param {DeckChannelHeaderStateInput} input
 */
export function buildDeckChannelHeaderState(input) {
	const {
		title,
		slug,
		playlistTitle,
		listening = false,
		listeningWhoSlug,
		listeningWhomTrackSlug,
		listeningWhomFallbackSlug,
		tagBaseSlug,
		toHref
	} = input

	const mapHref = (value) => {
		if (!value) return undefined
		const path = `/${value}`
		return toHref ? toHref(path) : path
	}

	const nextSlug = slug || undefined
	const nextListeningWho = listening ? listeningWhoSlug || undefined : undefined
	const nextListeningWhom = listening
		? getListeningWhomSlug(listeningWhomTrackSlug, listeningWhomFallbackSlug)
		: undefined
	const tags = extractPlaylistHashtags(playlistTitle).map((tag) => ({
		label: tag,
		href: buildTagHref(tagBaseSlug || nextSlug, tag)
	}))

	return {
		title: title ?? (nextSlug ? `@${nextSlug}` : '@unknown'),
		slug: nextSlug,
		slugHref: mapHref(nextSlug),
		listeningWhoSlug: nextListeningWho,
		listeningWhoHref: mapHref(nextListeningWho),
		listeningWhomSlug: nextListeningWhom,
		listeningWhomHref: mapHref(nextListeningWhom),
		tags
	}
}
