import {browser} from '$app/env'
import {error} from '@sveltejs/kit'
import {sdk} from '@radio4000/sdk'
import {normalizeTrackMedia} from '#lib/collections/tracks.js'
import type {Track} from '#lib/types.js'
import {isMissingRow} from '../../not-found'

export async function load({params}) {
	// The parent [slug] layout only carries the first SECTION_TRACK_LIMIT tracks,
	// so a deeper track would server-render as "not found" at HTTP 200.
	const {data, error: trackError} = await sdk.tracks.readTrack(params.tid)

	// A real track requested under the wrong channel is missing too,
	// rather than a second URL for the same track.
	const track = data?.slug === params.slug ? data : null

	// Server-only: in the browser the local collections may hold tracks Supabase does not.
	if (!track && !browser) {
		if (trackError && !isMissingRow(trackError)) error(500, `Could not load track ${params.tid}`)
		error(404, `Track not found: ${params.tid}`)
	}

	return {
		slug: params.slug,
		tid: params.tid,
		track: track ? normalizeTrackMedia(track as Track) : null
	}
}
