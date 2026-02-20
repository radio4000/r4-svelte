import {createContext} from 'svelte'
import type {Track} from '$lib/types'

/* I never liked context, but sometimes it's useful to avoid re-computing shared values that aren't stored on appState. */

/** Tracks query from [slug] layout */
export const [getTracksQueryCtx, setTracksQueryCtx] = createContext<{
	data: Track[]
	isReady: boolean
	isLoading: boolean
}>()

/** Track detail state shared by [slug]/tracks/[tid] tab routes */
export const [getTrackDetailCtx, setTrackDetailCtx] = createContext<{
	track: Track | undefined
	channel: import('$lib/types').Channel | undefined
	canEdit: boolean
	meta:
		| {
				media_id?: string
				youtube_data?: {[key: string]: unknown}
				musicbrainz_data?: object
				discogs_data?: object
		  }
		| undefined
	tracks: Track[]
	relatedTracks: Track[]
	hasYoutubeInfo: boolean
	hasMusicbrainzInfo: boolean
	hasDiscogsInfo: boolean
}>()
