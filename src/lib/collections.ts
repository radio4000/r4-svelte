import {createCollection, localStorageCollectionOptions} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {appStateSchema, channelSchema, trackSchema} from './schemas'

/**
 * App state collection - persists to localStorage, syncs across tabs
 */
export const appStateCollection = createCollection(
	localStorageCollectionOptions({
		id: 'app-state',
		storageKey: 'r5-app-state',
		getKey: (item) => item.id,
		schema: appStateSchema
	})
)

/**
 * Channels collection - fetches from r4 with v1 fallback
 * Handles both r4 (Supabase) and v1 (Firebase) channels
 */
export const channelsCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['channels'],
		queryFn: async () => {
			const {r5} = await import('./r5')

			// Fetch r4 channels first
			const r4Channels = await r5.channels.r4()

			// For now, return r4 channels only
			// v1 fallback will be handled per-channel basis in live queries
			return r4Channels
		},
		getKey: (item) => item.id,
		schema: channelSchema,

		// Mutations
		onUpdate: async ({transaction}) => {
			const {r4} = await import('./r4')
			const mutation = transaction.mutations[0]
			const channelId = mutation.original.id

			// Call r4 SDK to update on server
			await r4.sdk.channels.updateChannel(channelId, mutation.changes)
		},

		onDelete: async ({transaction}) => {
			const {r4} = await import('./r4')
			const channelId = transaction.mutations[0].original.id

			// Call r4 SDK to delete on server
			await r4.sdk.channels.deleteChannel(channelId)
		}
	})
)

/**
 * Tracks collection - fetches from r4 with v1 fallback
 * Requires channel context (slug) to fetch tracks
 * Note: This is a global collection, but tracks are filtered by channel in live queries
 */
export const tracksCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['tracks'],
		queryFn: async () => {
			// Return empty array by default
			// Tracks will be loaded per-channel via query parameters or mutations
			return []
		},
		getKey: (item) => item.id,
		schema: trackSchema,

		// Mutations
		onUpdate: async ({transaction}) => {
			const {r4} = await import('./r4')
			const mutation = transaction.mutations[0]
			const trackId = mutation.original.id

			// Call r4 SDK to update track on server
			await r4.sdk.tracks.updateTrack(trackId, mutation.changes)
		},

		onDelete: async ({transaction}) => {
			const {r4} = await import('./r4')
			const trackId = transaction.mutations[0].original.id

			// Call r4 SDK to delete track on server
			await r4.sdk.tracks.deleteTrack(trackId)
		},

		onInsert: async ({transaction}) => {
			const {r4} = await import('./r4')
			const newTrack = transaction.mutations[0].value

			// Call r4 SDK to create track on server
			await r4.sdk.tracks.createTrack(newTrack)
		}
	})
)
