import {extractHashtags, extractMentions} from '$lib/utils.ts'

/** Prefix a bare tag with `#` (view tags come without it). */
function prefixTag(value) {
	const tag = String(value || '')
	return tag.startsWith('#') ? tag : `#${tag}`
}

/**
 * @param {{
 *   decks: Record<string, any>,
 *   tracksState?: Map<string, any>,
 *   channelsState: Map<string, any>,
 *   followsState?: Map<string, any> | null,
 *   broadcastRows?: any[] | null
 * }} params
 */
export function deriveChannelActivityState(params) {
	const {decks, tracksState, channelsState, followsState = null, broadcastRows = []} = params
	const channelsBySlug = new Map()
	const channelsById = new Map()
	for (const ch of channelsState.values()) {
		const slug = String(ch?.slug || '').toLowerCase()
		if (slug) channelsBySlug.set(slug, ch)
		if (ch?.id) channelsById.set(ch.id, ch)
	}

	/** @type {Set<string>} */
	const activeChannelIds = new Set()
	/** @type {Set<string>} */
	const activeChannelSlugs = new Set()
	/** @type {Set<string>} */
	const activeTags = new Set()
	/** @type {Set<string>} */
	const explicitActiveMentions = new Set()
	/** @type {Set<string>} */
	const playingChannelSlugs = new Set()
	/** @type {Set<string>} */
	const inDeckChannelSlugs = new Set()
	/** @type {Set<string>} */
	const favoriteChannelIds = new Set()
	/** @type {Set<string>} */
	const broadcastingChannelIds = new Set()

	for (const follow of followsState?.values?.() ?? []) {
		const id = typeof follow === 'string' ? follow : follow?.id
		if (id) favoriteChannelIds.add(id)
	}
	for (const row of broadcastRows ?? []) {
		if (row?.channel_id) broadcastingChannelIds.add(row.channel_id)
	}

	for (const deck of Object.values(decks || {})) {
		for (const tag of extractHashtags(String(deck?.playlist_title || ''))) {
			const prefixed = prefixTag(tag)
			if (prefixed) activeTags.add(prefixed)
		}
		for (const mention of extractMentions(String(deck?.playlist_title || ''))) {
			if (mention.startsWith('@') && mention.length > 1) explicitActiveMentions.add(mention)
		}
		for (const tag of Array.isArray(deck?.view?.tags) ? deck.view.tags : []) {
			const prefixed = prefixTag(tag)
			if (prefixed) activeTags.add(prefixed)
		}

		const listeningId = deck?.listening_to_channel_id
		if (listeningId) {
			activeChannelIds.add(listeningId)
			const ch = channelsById.get(listeningId)
			if (ch?.slug) activeChannelSlugs.add(String(ch.slug).toLowerCase())
		}

		let slug = String(deck?.playlist_slug || '').toLowerCase()
		if (slug) inDeckChannelSlugs.add(slug)
		if (slug && deck?.is_playing) playingChannelSlugs.add(slug)

		// Active tags come only from deck state (playlist title + selected view tags),
		// not from current track tags, to keep UI synchronization deterministic.
		const trackId = deck?.playlist_track || deck?.playlist_tracks?.[0]
		const track = trackId ? tracksState?.get(trackId) : null
		if (!slug) slug = String(track?.slug || '').toLowerCase()
		if (!slug) continue

		activeChannelSlugs.add(slug)
		const ch = channelsBySlug.get(slug)
		if (ch?.id) activeChannelIds.add(ch.id)
	}

	const activeMentions = [
		...new Set([...Array.from(activeChannelSlugs, (slug) => `@${slug}`), ...explicitActiveMentions])
	]
	return {
		activeChannelIds: [...activeChannelIds],
		activeChannelSlugs: [...activeChannelSlugs],
		activeTags: [...activeTags],
		activeMentions,
		playingChannelSlugs,
		inDeckChannelSlugs,
		favoriteChannelIds,
		broadcastingChannelIds
	}
}

/**
 * Build consistent channel-card media item payload for 2D/3D UIs.
 * @param {any} channel
 * @param {ReturnType<typeof deriveChannelActivityState>} state
 * @param {{url: string, width?: number, height?: number}} base
 */
export function toChannelCardMedia(channel, state, base) {
	const tags = extractHashtags(channel?.description || '')
	const mentions = extractMentions(channel?.description || '')
	const normalizedSlug = String(channel?.slug || '').toLowerCase()
	const normalizedTags = tags.map((tag) => prefixTag(tag)).filter(Boolean)
	const matchingActiveTags = normalizedTags.filter((tag) => state.activeTags.includes(tag))
	return {
		url: base.url,
		width: base.width ?? 250,
		height: base.height ?? 250,
		slug: channel.slug,
		id: channel.id,
		name: channel.name,
		description: channel.description || '',
		tags,
		mentions,
		activeTags: matchingActiveTags,
		activeMentions: state.activeMentions,
		hasActiveTagMatch: matchingActiveTags.length > 0,
		isActive: state.activeChannelIds.includes(channel.id),
		isPlaying: state.playingChannelSlugs.has(normalizedSlug),
		isFavorite: state.favoriteChannelIds.has(channel.id),
		isLive: state.broadcastingChannelIds.has(channel.id),
		channel
	}
}
