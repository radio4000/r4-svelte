import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'
import {createLocalCollection} from './utils'

// Spam decisions collection - local-only admin state of the spam-angel page: the channels an
// admin looked at and kept. Quarantine itself lives in the database.
export interface SpamDecision {
	channelId: string
	spam: boolean // false = kept; true was "mark for deletion", before quarantine, now ignored
}

export const spamDecisionsCollection = createLocalCollection<SpamDecision, string>({
	id: 'spam-decisions',
	storageKey: LOCAL_STORAGE_KEYS.spamDecisions,
	getKey: (item) => item.channelId
})
