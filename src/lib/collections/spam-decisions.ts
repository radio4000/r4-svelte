import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

// Spam decisions collection - local-only admin state for spam-warrior tool
export interface SpamDecision {
	channelId: string
	spam: boolean // true = mark for deletion, false = keep
}

export const spamDecisionsCollection = createCollection<SpamDecision, string>(
	localStorageCollectionOptions({
		id: 'spam-decisions',
		storageKey: LOCAL_STORAGE_KEYS.spamDecisions,
		getKey: (item) => item.channelId
	})
)
