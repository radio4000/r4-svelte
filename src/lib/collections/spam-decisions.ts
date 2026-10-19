import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'
import {createLocalCollection} from './utils'

// Spam decisions collection - local-only admin state for spam-warrior tool
export interface SpamDecision {
	channelId: string
	spam: boolean // true = mark for deletion, false = keep
}

export const spamDecisionsCollection = createLocalCollection<SpamDecision, string>({
	id: 'spam-decisions',
	storageKey: LOCAL_STORAGE_KEYS.spamDecisions,
	getKey: (item) => item.channelId
})
