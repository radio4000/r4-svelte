import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

// Track metadata collection - local-only cache for YouTube/MusicBrainz/Discogs enrichment
// No server sync needed, persists to localStorage, syncs across tabs
export interface TrackMeta {
	media_id: string
	youtube_data?: {id?: string; duration?: number; [key: string]: unknown}
	musicbrainz_data?: object
	discogs_data?: object
}

export const trackMetaCollection = createCollection<TrackMeta, string>(
	localStorageCollectionOptions({
		storageKey: LOCAL_STORAGE_KEYS.trackMeta,
		getKey: (item) => item.media_id
	})
)

export function deleteTrackMeta(mediaIds: string[]) {
	for (const mediaId of mediaIds) {
		trackMetaCollection.delete(mediaId)
	}
}
