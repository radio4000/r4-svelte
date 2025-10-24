import {createCollection, localStorageCollectionOptions} from '@tanstack/svelte-db'
import {appStateSchema, channelSchema, trackSchema, playHistorySchema, followerSchema, trackMetaSchema} from './schemas'
import {r5} from './r5'
import {r4} from './r4'

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
 * Channels collection - persists channels to localStorage
 */
export const channelsCollection = createCollection(
	localStorageCollectionOptions({
		id: 'channels',
		storageKey: 'r5-channels',
		getKey: (item) => item.id,
		schema: channelSchema
	})
)

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

// No longer needed - collections are now all localStorage-based
export function initCollections() {
	// Collections are initialized directly above, no longer need QueryClient
	// Keeping this function for backward compatibility
}

export function getChannelsCollection() {
	return channelsCollection
}

export function getTracksCollection() {
	return tracksCollection
}

/**
 * Preload all channels from remote into collection
 * Called once on app startup if collection is empty
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

	// Insert into collection
	for (const channel of allChannels) {
		const existing = channelsCollection.toArray.find((c) => c.id === channel.id)
		if (existing) {
			channelsCollection.update(channel.id, () => channel)
		} else {
			channelsCollection.insert(channel)
		}
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

	// Insert into collection
	for (const track of denormalized) {
		const existing = tracksCollection.toArray.find((t) => t.id === track.id)
		if (existing) {
			tracksCollection.update(track.id, () => track)
		} else {
			tracksCollection.insert(track)
		}
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
