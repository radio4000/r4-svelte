import {tracksCollection} from '#lib/collections/tracks.js'
import type {Track} from '#lib/types.js'

/** The loaded tracks of one channel, scanned from the local tracks collection (unordered). */
export function channelTracks(slug: string | undefined): Track[] {
	return [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
}
