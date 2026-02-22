import {extractHashtags} from '$lib/utils.ts'

/**
 * Build shared deck-driven state for 2D/3D channel cards.
 * - active channels: all channels currently loaded in decks/listening
 * - active tags: hashtags from all deck playlist titles
 * - active mentions: @slug for channels currently active in decks
 *
 * @param {{
 *   decks: Record<string, any>,
 *   tracksState: Map<string, any>,
 *   channelsState: Map<string, any>
 * }} params
 */
export function deriveChannelCanvasState(params) {
	const {decks, tracksState, channelsState} = params
	const normalizeTag = (value) => {
		const token = String(value || '')
			.trim()
			.toLowerCase()
			.replace(/^[﹟＃]/, '#')
			.replace(/[.,;:!?]+$/g, '')
		if (!token) return ''
		return token.startsWith('#') ? token : `#${token}`
	}
	const playlistTags = (title) =>
		extractHashtags(String(title || ''))
			.map((tag) => normalizeTag(tag))
			.filter(Boolean)
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

	for (const deck of Object.values(decks || {})) {
		for (const tag of playlistTags(deck?.playlist_title)) activeTags.add(tag)
		for (const tag of Array.isArray(deck?.view?.tags) ? deck.view.tags : []) {
			const normalized = normalizeTag(tag)
			if (normalized) activeTags.add(normalized)
		}

		const listeningId = deck?.listening_to_channel_id
		if (listeningId) {
			activeChannelIds.add(listeningId)
			const ch = channelsById.get(listeningId)
			if (ch?.slug) activeChannelSlugs.add(String(ch.slug).toLowerCase())
		}

		let slug = String(deck?.playlist_slug || '').toLowerCase()
		const trackId = deck?.playlist_track || deck?.playlist_tracks?.[0]
		const track = trackId ? tracksState.get(trackId) : null
		for (const tag of Array.isArray(track?.tags) ? track.tags : []) {
			const normalized = normalizeTag(tag)
			if (normalized) activeTags.add(normalized)
		}
		if (!slug) slug = String(track?.slug || '').toLowerCase()
		if (!slug) continue

		activeChannelSlugs.add(slug)
		const ch = channelsBySlug.get(slug)
		if (ch?.id) activeChannelIds.add(ch.id)
	}

	const activeMentions = Array.from(activeChannelSlugs, (slug) => `@${slug}`)
	return {
		activeChannelIds: [...activeChannelIds],
		activeChannelSlugs: [...activeChannelSlugs],
		activeTags: [...activeTags],
		activeMentions
	}
}
