import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

// Track metadata collection - local-only cache for YouTube/MusicBrainz/Discogs enrichment
// No server sync needed, persists to localStorage, syncs across tabs
export interface TrackMeta {
	media_id: string
	provider?: string | null
	youtube_data?: {id?: string; duration?: number; [key: string]: unknown}
	musicbrainz_data?: object
	discogs_data?: object
}

export function trackMetaKey(provider: string | null | undefined, mediaId: string): string {
	return `${provider ?? 'unknown'}:${mediaId}`
}

export const trackMetaCollection = createCollection<TrackMeta, string>(
	localStorageCollectionOptions({
		storageKey: LOCAL_STORAGE_KEYS.trackMeta,
		getKey: (item) => trackMetaKey(item.provider, item.media_id)
	})
)

export function deleteTrackMeta(items: Array<{media_id?: string | null; provider?: string | null}>) {
	for (const item of items) {
		if (!item.media_id) continue
		trackMetaCollection.delete(trackMetaKey(item.provider, item.media_id))
	}
}
