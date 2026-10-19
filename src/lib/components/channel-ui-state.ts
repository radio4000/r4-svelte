import {extractHashtags, extractMentions, channelAvatarUrl} from '#lib/utils.ts'
import type {Channel, Deck} from '#lib/types.js'

/** Prefix a bare tag with `#` (view tags come without it). */
function prefixTag(value: unknown): string {
	const tag = String(value || '')
	return tag.startsWith('#') ? tag : `#${tag}`
}

/** Minimal structural inputs — only the fields the derivation reads. */
export interface ChannelActivityParams {
	decks: Record<number, Partial<Deck>>
	tracksState?: Map<string, {slug?: string | null}>
	channelsState: Map<string, {id?: string; slug?: string | null}>
	followsState?: Map<string, {id?: string} | string> | null
	broadcastRows?: Array<{channel_id?: string | null}> | null
}

export function deriveChannelActivityState(params: ChannelActivityParams) {
	const {decks, tracksState, channelsState, followsState = null, broadcastRows = []} = params
	const channelsBySlug = new Map<string, {id?: string; slug?: string | null}>()
	const channelsById = new Map<string, {id?: string; slug?: string | null}>()
	for (const ch of channelsState.values()) {
		const slug = String(ch?.slug || '').toLowerCase()
		if (slug) channelsBySlug.set(slug, ch)
		if (ch?.id) channelsById.set(ch.id, ch)
	}

	const activeChannelIds = new Set<string>()
	const activeChannelSlugs = new Set<string>()
	const activeTags = new Set<string>()
	const explicitActiveMentions = new Set<string>()
	const playingChannelSlugs = new Set<string>()
	const inDeckChannelSlugs = new Set<string>()
	const favoriteChannelIds = new Set<string>()
	const broadcastingChannelIds = new Set<string>()

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
		for (const source of deck?.view?.sources ?? []) {
			for (const tag of source.tags ?? []) {
				const prefixed = prefixTag(tag)
				if (prefixed) activeTags.add(prefixed)
			}
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

export type ChannelActivityState = ReturnType<typeof deriveChannelActivityState>

/** Channel-card payload shared by the 2D grid and 3D canvas renderers. */
export interface MediaItem {
	url: string
	width?: number
	height?: number
	slug?: string
	id?: string
	name?: string
	title?: string
	description?: string
	channel_slug?: string
	channel?: {slug?: string | null}
	isFavorite?: boolean
	isLive?: boolean
	isPlaying?: boolean
	tags?: string[]
	mentions?: string[]
	activeTags?: string[]
	activeMentions?: string[]
	isActive?: boolean
	hasActiveTagMatch?: boolean
}

/**
 * Build consistent channel-card media item payload for 2D/3D UIs.
 * When `base` is omitted, derives image URL from `channel.image` via `channelAvatarUrl`
 * with a placeholder fallback.
 */
export function toChannelCardMedia(
	channel: Channel,
	state: ChannelActivityState,
	base?: {url: string; width?: number; height?: number}
): MediaItem {
	const url =
		base?.url ??
		(channel.image
			? channelAvatarUrl(channel.image)
			: `https://placehold.co/250?text=${encodeURIComponent(channel.name?.[0] || '?')}`)
	const tags = extractHashtags(channel?.description || '')
	const mentions = extractMentions(channel?.description || '')
	const normalizedTags = tags.map((tag) => prefixTag(tag)).filter(Boolean)
	const matchingActiveTags = normalizedTags.filter((tag) => state.activeTags.includes(tag))
	return {
		url,
		width: base?.width ?? 250,
		height: base?.height ?? 250,
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
		isPlaying: state.playingChannelSlugs.has(channel.slug),
		isFavorite: state.favoriteChannelIds.has(channel.id),
		isLive: state.broadcastingChannelIds.has(channel.id),
		channel
	}
}
