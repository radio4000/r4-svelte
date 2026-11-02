import type {Track} from '#lib/types.js'

export type TrackAddData = {
	url: string
	title: string
	description: string
	discogs_url: string
}

/** Prefill for adding an existing track to the user's radio; credits the source channel as `via @slug`. */
export function trackAddData(track: Track): TrackAddData {
	return {
		url: track.url,
		title: track.title || '',
		description: track.description
			? track.slug
				? `${track.description} via @${track.slug}`
				: track.description
			: track.slug
				? `via @${track.slug}`
				: '',
		discogs_url: track.discogs_url || ''
	}
}

/** Prefill as URLSearchParams for /add links, skipping empty fields. */
export function trackAddSearchParams(track: Track): URLSearchParams {
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(trackAddData(track))) {
		if (value) params.set(key, value)
	}
	return params
}
