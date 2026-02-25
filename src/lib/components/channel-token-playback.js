const RE_TAG_PREFIX = /^[#﹟＃]/
const RE_MENTION_PREFIX = /^@/
const RE_TRAILING_PUNCTUATION = /[.,;:!?]+$/g

/**
 * @param {unknown} value
 */
export function normalizeTagToken(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(RE_TAG_PREFIX, '')
		.replace(RE_TRAILING_PUNCTUATION, '')
}

/**
 * @param {unknown} value
 */
export function normalizeMentionToken(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(RE_MENTION_PREFIX, '')
		.replace(RE_TRAILING_PUNCTUATION, '')
}

/**
 * @param {any[]} tracks
 */
function sortTracksNewestFirst(tracks) {
	return tracks.toSorted((a, b) => {
		const av = String(a?.created_at || '')
		const bv = String(b?.created_at || '')
		if (av === bv) return 0
		return av < bv ? 1 : -1
	})
}

/**
 * @param {any[]} tracks
 * @param {'tag' | 'mention'} kind
 * @param {string} token
 */
export function filterTracksByToken(tracks, kind, token) {
	if (kind !== 'tag' && kind !== 'mention') return {normalizedToken: '', title: '', matches: []}
	const normalize = kind === 'tag' ? normalizeTagToken : normalizeMentionToken
	const normalizedToken = normalize(token)
	if (!normalizedToken) return {normalizedToken: '', title: '', matches: []}
	const field = kind === 'tag' ? 'tags' : 'mentions'
	const matches = sortTracksNewestFirst(
		tracks.filter((track) => {
			const values = Array.isArray(track?.[field]) ? track[field] : []
			return values.some((entry) => normalize(entry) === normalizedToken)
		})
	)
	return {
		normalizedToken,
		title: kind === 'tag' ? `#${normalizedToken}` : `@${normalizedToken}`,
		matches
	}
}

/**
 * @param {any} item
 */
function resolveItemSlug(item) {
	return String(item?.slug || item?.channel_slug || item?.channel?.slug || '')
		.trim()
		.toLowerCase()
		.replace(RE_MENTION_PREFIX, '')
}

/**
 * @param {any} item
 * @param {'tag' | 'mention'} kind
 * @param {string} token
 * @param {number} deckId
 */
export async function playChannelTokenInDeck(item, kind, token, deckId) {
	if (kind !== 'tag' && kind !== 'mention') return false
	const slug = resolveItemSlug(item)
	if (!slug || !token) return false
	const [{playTrack, setPlaylist}, {ensureTracksLoaded, tracksCollection}] = await Promise.all([
		import('$lib/api'),
		import('$lib/collections/tracks')
	])
	await ensureTracksLoaded(slug)
	const channelTracks = [...tracksCollection.state.values()].filter((track) => track?.slug === slug)
	const {title, matches} = filterTracksByToken(channelTracks, kind, token)
	if (!matches.length) return false
	const ids = matches.map((track) => track?.id).filter(Boolean)
	if (!ids.length) return false
	setPlaylist(deckId, ids, {title, slug})
	await playTrack(deckId, ids[0], null, 'play_search')
	return true
}

/**
 * @param {any} item
 */
export async function toggleChannelFavorite(item) {
	const channelId = String(item?.id || '').trim()
	if (!channelId) return false
	const [{appState}, {followsCollection, followChannel, unfollowChannel}] = await Promise.all([
		import('$lib/app-state.svelte'),
		import('$lib/collections/follows')
	])
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return false
	const isFavorite = followsCollection.state.has(channelId) || !!item?.isFavorite
	if (isFavorite) await unfollowChannel(channelId)
	else await followChannel(channelId)
	return true
}
