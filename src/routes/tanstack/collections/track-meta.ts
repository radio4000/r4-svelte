import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'

// Track metadata collection - local-only cache for YouTube/MusicBrainz/Discogs enrichment
// No server sync needed, persists to localStorage, syncs across tabs
export interface TrackMeta {
	ytid: string
	youtube_data?: {id?: string; duration?: number; [key: string]: unknown}
	musicbrainz_data?: object
	discogs_data?: object
}

export const trackMetaCollection = createCollection<TrackMeta, string>(
	localStorageCollectionOptions({
		storageKey: 'r5-track-meta',
		getKey: (item) => item.ytid
	})
)
