import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'
import type {TrackMetadataFields} from '#lib/types.js'
import {createLocalCollection} from './utils'

// Track metadata collection - local-only cache for YouTube/MusicBrainz/Discogs enrichment
// No server sync needed, persists to localStorage, syncs across tabs
export interface TrackMeta extends TrackMetadataFields {
	media_id: string
	provider?: string | null
}

/** Composite key for track-meta rows: provider is often unknown, so it defaults in. */
export function trackMetaKey(provider: string | null | undefined, mediaId: string): string {
	return `${provider ?? 'unknown'}:${mediaId}`
}

export const trackMetaCollection = createLocalCollection<TrackMeta, string>({
	storageKey: LOCAL_STORAGE_KEYS.trackMeta,
	getKey: (item) => trackMetaKey(item.provider, item.media_id)
})

/** Remove cached metadata for the given tracks (e.g. after a track's url changes). */
export function deleteTrackMeta(
	items: Array<{media_id?: string | null; provider?: string | null}>
) {
	for (const item of items) {
		if (!item.media_id) continue
		trackMetaCollection.delete(trackMetaKey(item.provider, item.media_id))
	}
}
