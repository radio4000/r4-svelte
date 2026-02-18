import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {queryClient} from './query-client'
import {log} from './utils'
import {appState} from '$lib/app-state.svelte'

/** @typedef {import('$lib/types').BroadcastWithChannel} BroadcastWithChannel */

const BROADCAST_SELECT = `
	channel_id,
	track_played_at,
	decks,
	channels:channels_with_tracks (*)
`

/**
 * Fetch all active broadcasts with their channel and track data.
 * Type-narrows Supabase response to BroadcastWithChannel[].
 * @returns {Promise<BroadcastWithChannel[]>}
 */
export async function readBroadcasts() {
	const {data, error} = await sdk.supabase.from('broadcast').select(BROADCAST_SELECT)
	if (error) throw error
	return /** @type {BroadcastWithChannel[]} */ (/** @type {unknown} */ (data || []))
}

/**
 * Fetch a single broadcast by channel ID.
 * @param {string} channelId
 * @returns {Promise<BroadcastWithChannel | null>}
 */
export async function readBroadcast(channelId) {
	const {data, error} = await sdk.supabase
		.from('broadcast')
		.select(BROADCAST_SELECT)
		.eq('channel_id', channelId)
		.single()
	if (error?.code === 'PGRST116') return null // not found
	if (error) throw error
	return /** @type {BroadcastWithChannel} */ (/** @type {unknown} */ (data))
}

export const broadcastsCollection = createCollection(
	queryCollectionOptions({
		queryKey: () => ['broadcasts'],
		queryClient,
		getKey: (/** @type {BroadcastWithChannel} */ item) => item.channel_id,
		staleTime: 0,
		queryFn: async () => {
			const broadcasts = await readBroadcasts()
			syncBroadcastingState(broadcasts)
			return broadcasts
		}
	})
)

/**
 * Reconcile broadcastsCollection state from a fresh snapshot.
 * @param {BroadcastWithChannel[]} broadcasts
 */
function reconcileBroadcastsSnapshot(broadcasts) {
	const nextIds = new Set(broadcasts.map((b) => b.channel_id))
	for (const b of broadcasts) broadcastsCollection.utils.writeUpsert(b)
	for (const existing of broadcastsCollection.state.values()) {
		if (!nextIds.has(existing.channel_id)) {
			broadcastsCollection.utils.writeDelete(existing.channel_id)
		}
	}
	syncBroadcastingState([...broadcastsCollection.state.values()])
}

/**
 * Sync broadcasting_channel_id on all decks from the broadcasts list
 * @param {BroadcastWithChannel[]} broadcasts
 */
function syncBroadcastingState(broadcasts) {
	const userChannelId = appState.channels?.[0]
	const isUserBroadcasting = userChannelId && broadcasts.some((b) => b.channel_id === userChannelId)
	for (const deck of Object.values(appState.decks)) {
		if (deck.broadcasting_channel_id === userChannelId) {
			deck.broadcasting_channel_id = isUserBroadcasting ? userChannelId : undefined
		}
	}
}

sdk.supabase
	.channel('broadcasts-realtime')
	.on('postgres_changes', {event: '*', schema: 'public', table: 'broadcast'}, async (payload) => {
		log.info('broadcasts realtime', {event: payload.eventType})

		if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
			const newData = /** @type {{channel_id: string}} */ (payload.new)
			const broadcast = await readBroadcast(newData.channel_id)
			if (broadcast) {
				broadcastsCollection.utils.writeUpsert(broadcast)
				syncBroadcastingState([...broadcastsCollection.state.values()])
			}
		}

		if (payload.eventType === 'DELETE') {
			const oldData = /** @type {{channel_id: string}} */ (payload.old)
			broadcastsCollection.utils.writeDelete(oldData.channel_id)
			if (oldData.channel_id === appState.channels?.[0]) {
				for (const deck of Object.values(appState.decks)) {
					if (deck.broadcasting_channel_id === oldData.channel_id) {
						deck.broadcasting_channel_id = undefined
					}
				}
			}
			syncBroadcastingState([...broadcastsCollection.state.values()])
		}
	})
	.subscribe((status) => {
		log.debug('broadcasts subscription status', {status})
	})

// Refresh broadcasts on tab focus (realtime handles the rest).
if (typeof window !== 'undefined') {
	const refreshBroadcasts = async () => {
		try {
			const broadcasts = await readBroadcasts()
			reconcileBroadcastsSnapshot(broadcasts)
		} catch (error) {
			log.warn('broadcasts poll failed', error)
		}
	}
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void refreshBroadcasts()
	})
}
