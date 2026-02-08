import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {queryClient} from './query-client'
import {log} from './utils'
import {appState} from '$lib/app-state.svelte'

/** @typedef {import('$lib/types').BroadcastWithChannel} BroadcastWithChannel */

const BROADCAST_SELECT = `
	channel_id,
	track_id,
	track_played_at,
	channels:channels_with_tracks (*),
	tracks:channel_tracks!track_id (*)
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
 * Sync appState.broadcasting_channel_id from the broadcasts list
 * @param {BroadcastWithChannel[]} broadcasts
 */
function syncBroadcastingState(broadcasts) {
	const userChannelId = appState.channels?.[0]
	const isUserBroadcasting = userChannelId && broadcasts.some((b) => b.channel_id === userChannelId)
	appState.broadcasting_channel_id = isUserBroadcasting ? userChannelId : undefined
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
				appState.broadcasting_channel_id = undefined
			}
			syncBroadcastingState([...broadcastsCollection.state.values()])
		}
	})
	.subscribe((status) => {
		log.info('broadcasts subscription status', {status})
	})
