import {playTrack, seekTo} from '$lib/api'
import {appState} from '$lib/app-state.svelte'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {broadcastsCollection, channelsCollection, tracksCollection, ensureTracksLoaded} from '$lib/tanstack/collections'

const log = logger.ns('broadcast').seal()

/** Get slug for a channel ID, or short ID if not found */
function label(channelId) {
	return channelsCollection.get(channelId)?.slug || channelId?.slice(0, 8)
}

/** @param {string} channelId */
function isV1Channel(channelId) {
	return channelsCollection.get(channelId)?.source === 'v1'
}

/** @param {string} trackId */
function isV1Track(trackId) {
	const track = tracksCollection.get(trackId)
	if (!track) return false
	const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
	return channel?.source === 'v1'
}

/** Supabase channel for listening to a single broadcast's updates
 * @type {any}
 */
let broadcastChannel = null

/** @param {string} channelId */
export async function joinBroadcast(channelId) {
	try {
		const {data} = await sdk.supabase.from('broadcast').select('*').eq('channel_id', channelId).single().throwOnError()

		// Prefetch all tracks for this channel
		const broadcast = broadcastsCollection.state.get(channelId)
		const slug = broadcast?.channels.slug
		if (slug) {
			ensureTracksLoaded(slug)
			log.log(`prefetching ${slug}`)
		}

		await playBroadcastTrack(data)
		startBroadcastSync(channelId)
		log.log(`joined ${label(channelId)}`)
	} catch (error) {
		log.error(`join failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
	}
}

export function leaveBroadcast() {
	stopBroadcastSync()
	appState.listening_to_channel_id = undefined
	appState.is_playing = false
	log.log('left')
}

/**
 * Helper to upsert a broadcast record
 * @param {string} channelId
 * @param {string} trackId
 */
export async function upsertRemoteBroadcast(channelId, trackId) {
	return sdk.supabase
		.from('broadcast')
		.upsert(
			{
				channel_id: channelId,
				track_id: trackId,
				track_played_at: new Date().toISOString()
			},
			{onConflict: 'channel_id'}
		)
		.throwOnError()
}

/**
 * @param {string} channelId
 * @param {string} [trackId]
 */
export async function startBroadcast(channelId, trackId) {
	if (!trackId) {
		log.log(`skipped ${label(channelId)} (no track)`)
		return
	}
	if (isV1Channel(channelId)) {
		throw new Error('Legacy channels cannot broadcast')
	}
	if (isV1Track(trackId)) {
		throw new Error('This track is from a legacy channel and cannot be streamed live')
	}

	await upsertRemoteBroadcast(channelId, trackId)
	log.log(`started ${label(channelId)}`)
}

/**
 * @param {string} channelId
 */
export async function stopBroadcast(channelId) {
	if (!channelId) return
	try {
		await sdk.supabase.from('broadcast').delete().eq('channel_id', channelId).throwOnError()
		log.log(`stopped ${label(channelId)}`)
	} catch (error) {
		log.error(`stop failed ${label(channelId)}:`, /** @type {Error} */ (error).message)
	}
}

/** @param {string} channelId */
function startBroadcastSync(channelId) {
	stopBroadcastSync()

	broadcastChannel = sdk.supabase
		.channel(`broadcast:${channelId}`)
		.on(
			'postgres_changes',
			{
				event: 'UPDATE',
				schema: 'public',
				table: 'broadcast',
				filter: `channel_id=eq.${channelId}`
			},
			(payload) => {
				const broadcast = /** @type {import('$lib/types').Broadcast} */ (payload.new)
				const track = tracksCollection.get(broadcast.track_id)
				log.log(`track changed: ${track?.title?.slice(0, 30) || broadcast.track_id.slice(0, 8)}`)
				playBroadcastTrack(broadcast)
			}
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') log.log(`syncing ${label(channelId)}`)
		})
}

function stopBroadcastSync() {
	if (broadcastChannel) {
		log.log('stopping_sync')
		broadcastChannel.unsubscribe()
		broadcastChannel = null
	}
}

/**
 * Calculate elapsed seconds from track_played_at
 * @param {import('$lib/types').Broadcast} broadcast
 * @param {import('$lib/types').Track} track
 * @returns {number|undefined}
 */
function calculateSeekTime(broadcast, track) {
	if (!broadcast.track_played_at) return undefined
	const elapsed = (Date.now() - new Date(broadcast.track_played_at).getTime()) / 1000
	if (elapsed < 0) return undefined
	// If we know duration, don't seek past end. Otherwise let player handle it.
	if (track.duration && elapsed >= track.duration) return undefined
	return Math.floor(elapsed)
}

/**
 * @param {import('$lib/types').Broadcast} broadcast
 */
async function playBroadcastTrack(broadcast) {
	const {track_id, channel_id} = broadcast

	// Check if track is already loaded
	let track = tracksCollection.get(track_id)
	if (!track) {
		// Track not loaded - fetch it directly by ID
		try {
			const {data, error} = await sdk.tracks.readTrack(track_id)
			if (error || !data) throw new Error(`Track ${track_id} not found`)
			tracksCollection.utils.writeUpsert(/** @type {import('$lib/types').Track} */ (data))
			track = /** @type {import('$lib/types').Track} */ (data)
		} catch (error) {
			log.error(`play failed:`, /** @type {Error} */ (error).message)
			return false
		}
	}

	const seekTime = calculateSeekTime(broadcast, track)
	await playTrack(track_id, null, 'broadcast_sync')
	if (seekTime !== undefined) {
		requestAnimationFrame(() => seekTo(seekTime))
		log.log(`seek +${seekTime}s`)
	}
	appState.listening_to_channel_id = channel_id
	return true
}

/** Validate that listening_to_channel_id points to an active broadcast */
export async function validateListeningState() {
	if (!appState.listening_to_channel_id) return

	try {
		const {data} = await sdk.supabase
			.from('broadcast')
			.select('channel_id')
			.eq('channel_id', appState.listening_to_channel_id)
			.single()

		if (!data) {
			appState.listening_to_channel_id = undefined
		}
	} catch {
		appState.listening_to_channel_id = undefined
	}
}
