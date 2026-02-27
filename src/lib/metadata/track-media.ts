import {parseUrl} from 'media-now/parse-url'
import type {Track} from '$lib/types'

export type TrackMediaRef = {
	provider: string | null
	mediaId: string | null
}

type TrackMediaInput = Pick<Track, 'url' | 'provider' | 'media_id'> | null | undefined

export function deriveTrackMedia(track: TrackMediaInput): TrackMediaRef {
	if (!track) {
		return {provider: null, mediaId: null}
	}

	const parsed = track.url ? parseUrl(track.url) : null
	return {
		provider: track.provider ?? parsed?.provider ?? null,
		mediaId: track.media_id ?? parsed?.id ?? null
	}
}
