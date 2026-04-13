import {parseUrl} from 'media-now'
import type {Track} from '$lib/types'

export const CHANNEL_MATCH_WEIGHTS = {
	url: 60,
	artistTitle: 40
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

function ratio(left: Set<string>, right: Set<string>) {
	let overlap = 0
	for (const v of left) {
		if (right.has(v)) overlap += 1
	}
	const base = right.size
	if (base === 0) {
		return {overlap, base, ratio: 1}
	}
	return {
		overlap,
		base,
		ratio: overlap / base
	}
}

function buildSet(tracks: Track[], getKey: (track: Track) => string | null) {
	const items = tracks.map(getKey).filter((v): v is string => Boolean(v))
	return new Set(items)
}

function buildPart(weight: number, left: Set<string>, right: Set<string>): MatchScorePart {
	const {overlap, base, ratio: overlapRatio} = ratio(left, right)
	return {
		weight,
		left: left.size,
		right: right.size,
		overlap,
		base,
		ratio: overlapRatio,
		score: overlapRatio * weight
	}
}

export function computeChannelMatchScore(myTracks: Track[], targetTracks: Track[]): ChannelMatchScore {
	const myUrlSet = buildSet(myTracks, getCanonicalUrlKey)
	const targetUrlSet = buildSet(targetTracks, getCanonicalUrlKey)
	const myArtistTitleSet = buildSet(myTracks, getArtistTitleKey)
	const targetArtistTitleSet = buildSet(targetTracks, getArtistTitleKey)

	const url = buildPart(CHANNEL_MATCH_WEIGHTS.url, myUrlSet, targetUrlSet)
	const artistTitle = buildPart(CHANNEL_MATCH_WEIGHTS.artistTitle, myArtistTitleSet, targetArtistTitleSet)
	const total = Math.max(0, Math.min(100, Math.round(url.score + artistTitle.score)))

	return {total, url, artistTitle}
}
