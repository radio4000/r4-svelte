import {createCollection, localStorageCollectionOptions} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {appStateSchema, channelSchema, trackSchema, playHistorySchema, followerSchema, trackMetaSchema} from './schemas'
import {r4} from './r4'
import {r5} from './r5'
import type {QueryClient} from '@tanstack/svelte-query'

// All collections now use localStorage for persistence (PGlite removed)
// - createCollection from @tanstack/svelte-db
// - useLiveQuery from @tanstack/svelte-db (Svelte rune-based)

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
 * Play history collection - persists listening history to localStorage
 */
export const playHistoryCollection = createCollection(
	localStorageCollectionOptions({
		id: 'play-history',
		storageKey: 'r5-play-history',
		getKey: (item) => item.id,
		schema: playHistorySchema
	})
)

/**
 * Followers collection - persists follower relationships to localStorage
 */
export const followersCollection = createCollection(
	localStorageCollectionOptions({
		id: 'followers',
		storageKey: 'r5-followers',
		getKey: (item) => `${item.follower_id}:${item.channel_id}`,
		schema: followerSchema
	})
)

/**
 * Track metadata collection - persists enriched metadata to localStorage
 */
export const trackMetaCollection = createCollection(
	localStorageCollectionOptions({
		id: 'track-meta',
		storageKey: 'r5-track-meta',
		getKey: (item) => item.ytid,
		schema: trackMetaSchema
	})
)

/**
 * Initialize channels collection with queryClient
 * Must be called once from layout before using channelsCollection
 */
export function initChannelsCollection(queryClient: QueryClient) {
	if (channelsCollection) return channelsCollection

	channelsCollection = createCollection(
		queryCollectionOptions({
			queryKey: ['channels'],
			queryFn: async () => {
				// Fetch r4 channels
				const r4Channels = await r5.channels.r4()
				// Fetch v1 channels
				const v1Channels = await r5.channels.v1()
				// Merge: deduplicate by slug (r4 takes precedence)
				const r4Slugs = new Set(r4Channels.map((c) => c.slug))
				const uniqueV1 = v1Channels.filter((c) => !r4Slugs.has(c.slug))
				return [...r4Channels, ...uniqueV1]
			},
			queryClient,
			getKey: (item) => item.id,
			schema: channelSchema
		})
	)

	return channelsCollection
}

/**
 * Channels collection - auto-fetches from r4+v1, persists via TanStack Query cache
 * Must call initChannelsCollection() before using
 */
export let channelsCollection: ReturnType<typeof createCollection<any>>

/**
 * Tracks collection - persists tracks to localStorage
 */
export const tracksCollection = createCollection(
	localStorageCollectionOptions({
		id: 'tracks',
		storageKey: 'r5-tracks',
		getKey: (item) => item.id,
		schema: trackSchema
	})
)

/**
 * Preload all channels from remote into collection
 * Called once on app startup if collection is empty
 * Note: channelsCollection auto-fetches via queryFn, so this is rarely needed
 */
export async function preloadChannels() {
	// Fetch r4 channels
	const r4Channels = await r5.channels.r4()

	// Fetch v1 channels
	const v1Channels = await r5.channels.v1()

	// Merge: deduplicate by slug (r4 takes precedence)
	const r4Slugs = new Set(r4Channels.map((c) => c.slug))
	const uniqueV1 = v1Channels.filter((c) => !r4Slugs.has(c.slug))

	const allChannels = [...r4Channels, ...uniqueV1]

	// Batch insert/update (much faster than one-by-one)
	const existingIds = new Set(channelsCollection.toArray.map((c) => c.id))
	const toInsert = allChannels.filter((c) => !existingIds.has(c.id))
	const toUpdate = allChannels.filter((c) => existingIds.has(c.id))

	if (toInsert.length > 0) {
		channelsCollection.insert(toInsert)
	}
	if (toUpdate.length > 0) {
		toUpdate.forEach((channel) => {
			channelsCollection.update(channel.id, () => channel)
		})
	}

	return allChannels
}

/**
 * Fetch and populate tracks for a specific channel
 * Handles r4/v1 fallback and denormalization
 * Returns existing tracks if already loaded (prevents duplicate fetches)
 */
export async function fetchChannelTracks(slug: string, limit?: number) {
	// Check if tracks already loaded for this channel
	const existingTracks = tracksCollection.toArray.filter((t) => t.channel_slug === slug)
	if (existingTracks.length > 0) {
		return existingTracks
	}

	// Get channel to determine source
	const channels = channelsCollection.toArray
	const channel = channels.find((c) => c.slug === slug)
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
	const denormalized = tracks.map((t) => ({
		...t,
		channel_slug: slug
	}))

	// Batch insert into collection (much faster than one-by-one)
	const existingIds = new Set(tracksCollection.toArray.map((t) => t.id))
	const toInsert = denormalized.filter((t) => !existingIds.has(t.id))
	const toUpdate = denormalized.filter((t) => existingIds.has(t.id))

	if (toInsert.length > 0) {
		tracksCollection.insert(toInsert)
	}
	if (toUpdate.length > 0) {
		toUpdate.forEach((track) => {
			tracksCollection.update(track.id, () => track)
		})
	}

	return denormalized
}

/**
 * Check if a channel's tracks are outdated and need refetching
 * Uses collection data
 */
export async function isChannelOutdated(slug: string): Promise<boolean> {
	// Get channel from collection
	const channel = channelsCollection.toArray.find((ch) => ch.slug === slug)
	if (!channel?.id) return true
	if (!channel.tracks_synced_at) return true

	// Get latest local track from collection
	const localTracks = tracksCollection.toArray
		.filter((t) => t.channel_id === channel.id)
		.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

	if (!localTracks[0]) return true

	// v1 channels are frozen (read-only archive)
	if (channel.source === 'v1' && localTracks[0]) return false

	try {
		// Compare with remote latest track timestamp
		const {data: remoteLatest} = await r4.sdk.supabase
			.from('channel_track')
			.select('updated_at')
			.eq('channel_id', channel.id)
			.order('updated_at', {ascending: false})
			.limit(1)
			.single()

		if (!remoteLatest) return true

		// Compare timestamps (20s tolerance)
		const remoteMsRemoved = new Date(remoteLatest.updated_at || 0).setMilliseconds(0)
		const localMsRemoved = new Date(localTracks[0].updated_at || 0).setMilliseconds(0)
		const toleranceMs = 20 * 1000
		return remoteMsRemoved - localMsRemoved > toleranceMs
	} catch (error) {
		// On error, suggest update to be safe
		console.warn('isChannelOutdated error:', error)
		return true
	}
}
