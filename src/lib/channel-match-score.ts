import {parseUrl} from 'media-now'
import type {Track} from '$lib/types'

export const CHANNEL_MATCH_WEIGHTS = {
	url: 50,
	tag: 30,
	artistTitle: 20
} as const

export interface MatchScorePart {
	weight: number
	left: number
	right: number
	overlap: number
	base: number
	ratio: number
	score: number
}

export interface ChannelMatchScore {
	total: number
	url: MatchScorePart
	tag: MatchScorePart
	artistTitle: MatchScorePart
}

const RE_DIACRITICS = /[\u0300-\u036f]/g
const RE_TRACK_SPLIT = /\s+-\s+/
const RE_SPACE = /\s+/g
const RE_NOISE = /[^a-z0-9 ]/g

function normalizeText(input?: string | null) {
	if (!input) return ''
	return input
		.normalize('NFKD')
		.replace(RE_DIACRITICS, '')
		.toLowerCase()
		.replace(RE_NOISE, ' ')
		.replace(RE_SPACE, ' ')
		.trim()
}

function getCanonicalUrlKey(track: Track): string | null {
	const parsed = parseUrl(track.url ?? '')
	const provider = track.provider ?? parsed?.provider ?? null
	const mediaId = track.media_id ?? parsed?.id ?? null
	if (provider && mediaId) return `${provider}:${mediaId}`

	const raw = (track.url ?? '').trim()
	if (!raw) return null
	try {
		const u = new URL(raw)
		u.hash = ''
		return `${u.origin}${u.pathname}${u.search}`.toLowerCase()
	} catch {
		return raw.toLowerCase()
	}
}

function getArtistTitleKey(track: Track): string | null {
	const title = normalizeText(track.title)
	if (!title) return null
	const [artistRaw, trackRaw] = title.split(RE_TRACK_SPLIT, 2)
	if (!artistRaw || !trackRaw) return null
	const artist = normalizeText(artistRaw)
	const name = normalizeText(trackRaw)
	if (!artist || !name) return null
	return `${artist}::${name}`
}

function buildSet(tracks: Track[], getKey: (track: Track) => string | null) {
	const items = tracks.map(getKey).filter((v): v is string => Boolean(v))
	return new Set(items)
}

function buildTagSet(tracks: Track[]): Set<string> {
	const tags = new Set<string>()
	for (const track of tracks) {
		if (track.tags) {
			for (const tag of track.tags) {
				const normalized = normalizeText(tag)
				if (normalized) tags.add(normalized)
			}
		}
	}
	return tags
}

/**
 * Directional coverage: how much of the target (right) set is covered by the source (left).
 * ratio = overlap / right.size
 * When right is empty (base = 0): ratio = 0 — no data means no score, not a free pass.
 */
function coverageRatio(left: Set<string>, right: Set<string>) {
	let overlap = 0
	for (const v of left) {
		if (right.has(v)) overlap += 1
	}
	const base = right.size
	return {overlap, base, ratio: base === 0 ? 0 : overlap / base}
}

function buildPart(weight: number, left: Set<string>, right: Set<string>): MatchScorePart {
	const {overlap, base, ratio} = coverageRatio(left, right)
	return {
		weight,
		left: left.size,
		right: right.size,
		overlap,
		base,
		ratio,
		score: ratio * weight
	}
}

export function computeChannelMatchScore(
	myTracks: Track[],
	targetTracks: Track[]
): ChannelMatchScore {
	const myUrlSet = buildSet(myTracks, getCanonicalUrlKey)
	const targetUrlSet = buildSet(targetTracks, getCanonicalUrlKey)
	const myTagSet = buildTagSet(myTracks)
	const targetTagSet = buildTagSet(targetTracks)
	const myArtistTitleSet = buildSet(myTracks, getArtistTitleKey)
	const targetArtistTitleSet = buildSet(targetTracks, getArtistTitleKey)

	const url = buildPart(CHANNEL_MATCH_WEIGHTS.url, myUrlSet, targetUrlSet)
	const tag = buildPart(CHANNEL_MATCH_WEIGHTS.tag, myTagSet, targetTagSet)
	const artistTitle = buildPart(
		CHANNEL_MATCH_WEIGHTS.artistTitle,
		myArtistTitleSet,
		targetArtistTitleSet
	)

	const total = Math.max(0, Math.min(100, Math.round(url.score + tag.score + artistTitle.score)))

	return {total, url, tag, artistTitle}
}
