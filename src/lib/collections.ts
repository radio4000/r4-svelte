import {createCollection, localStorageCollectionOptions} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {appStateSchema, channelSchema, trackSchema} from './schemas'
import {r5} from './r5'
import {r4} from './r4'
import type {QueryClient} from '@tanstack/svelte-query'

// Svelte equivalent:
// - createCollection from @tanstack/svelte-db (not react-db)
// - useLiveQuery from @tanstack/svelte-db (Svelte rune-based)
// - queryCollectionOptions from @tanstack/query-db-collection (universal)

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

// Collections that require QueryClient are created lazily
let _channelsCollection: ReturnType<typeof createCollection> | null = null
let _tracksCollection: ReturnType<typeof createCollection> | null = null

export function initCollections(queryClient: QueryClient) {
	if (_channelsCollection && _tracksCollection) return

	_channelsCollection = createCollection(
		queryCollectionOptions({
			queryClient,
			queryKey: ['channels'],
			queryFn: async () => {
				// Fetch r4 channels first
				const r4Channels = await r5.channels.r4()

				// Fetch v1 channels
				const v1Channels = await r5.channels.v1()

				// Merge: deduplicate by slug (r4 takes precedence)
				const r4Slugs = new Set(r4Channels.map(c => c.slug))
				const uniqueV1 = v1Channels.filter(c => !r4Slugs.has(c.slug))

				return [...r4Channels, ...uniqueV1]
			},
			getKey: (item) => item.id,
			schema: channelSchema,

			// Mutations
			onUpdate: async ({transaction}) => {
				const mutation = transaction.mutations[0]
				const channelId = mutation.original.id

				// Call r4 SDK to update on server
				await r4.sdk.channels.updateChannel(channelId, mutation.changes)
			},

			onDelete: async ({transaction}) => {
				const channelId = transaction.mutations[0].original.id

				// Call r4 SDK to delete on server
				await r4.sdk.channels.deleteChannel(channelId)
			}
		})
	)

	_tracksCollection = createCollection(
		queryCollectionOptions({
			queryClient,
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
				const mutation = transaction.mutations[0]
				const trackId = mutation.original.id

				// Call r4 SDK to update track on server
				await r4.sdk.tracks.updateTrack(trackId, mutation.changes)
			},

			onDelete: async ({transaction}) => {
				const trackId = transaction.mutations[0].original.id

				// Call r4 SDK to delete track on server
				await r4.sdk.tracks.deleteTrack(trackId)
			},

			onInsert: async ({transaction}) => {
				const newTrack = transaction.mutations[0].value

				// Call r4 SDK to create track on server
				await r4.sdk.tracks.createTrack(newTrack)
			}
		})
	)
}

export function getChannelsCollection() {
	if (!_channelsCollection) {
		throw new Error('Collections not initialized. Call initCollections(queryClient) first.')
	}
	return _channelsCollection
}

export function getTracksCollection() {
	if (!_tracksCollection) {
		throw new Error('Collections not initialized. Call initCollections(queryClient) first.')
	}
	return _tracksCollection
}

/**
 * Fetch and populate tracks for a specific channel
 * Handles r4/v1 fallback and denormalization
 */
export async function fetchChannelTracks(slug: string, limit?: number) {
	const channelsCollection = getChannelsCollection()
	const tracksCollection = getTracksCollection()

	// Get channel to determine source
	const channels = channelsCollection.getAll()
	const channel = channels.find(c => c.slug === slug)
	if (!channel) {
		throw new Error(`Channel not found: ${slug}`)
	}

	let tracks = []

	// Fetch based on channel source
	if (channel.source === 'v1' && channel.firebase_id) {
		tracks = await r5.tracks.v1({
			firebase: channel.firebase_id,
			slug,
			channelId: channel.id,
			limit
		})
	} else {
		tracks = await r5.tracks.r4({slug, limit})
	}

	// Denormalize: add channel_slug to each track
	const denormalized = tracks.map(t => ({
		...t,
		channel_slug: slug
	}))

	// Insert into collection
	for (const track of denormalized) {
		tracksCollection.insert(track)
	}

	return denormalized
}
