import {playTrack} from '$lib/api'
import {appState} from '$lib/app-state.svelte'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {channelsCollection, queryClient} from '../routes/tanstack/collections'

const log = logger.ns('broadcast').seal()

async function readBroadcastsWithChannel() {
	const {data, error} = await sdk.supabase.from('broadcast').select(`
		channel_id,
		track_id,
		track_played_at,
		channels:channels_with_tracks (*)
	`)
	if (error) throw error
	return /** @type {import('$lib/types').BroadcastWithChannel[]} */ (data || [])
}

/** This will be the Supabase "channel" for broadcast updates
 * @type {any}
 */
let broadcastChannel = null

/** @param {string} channelId */
export async function joinBroadcast(channelId) {
	try {
		const {data} = await sdk.supabase.from('broadcast').select('*').eq('channel_id', channelId).single().throwOnError()
		await playBroadcastTrack(data)
		startBroadcastSync(channelId)
		log.log('joined', {channelId})
	} catch (error) {
		log.error('join_failed', {
			channelId,
			error: /** @type {Error} */ (error).message
		})
	}
}

export function leaveBroadcast() {
	stopBroadcastSync()
	appState.listening_to_channel_id = undefined
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
		.upsert({
			channel_id: channelId,
			track_id: trackId,
			track_played_at: new Date().toISOString()
		})
		.throwOnError()
}

/**
 * @param {string} channelId
 * @param {string} [trackId]
 */
export async function startBroadcast(channelId, trackId) {
	log.log('start_requested', {channelId, trackId})

	if (!trackId) {
		log.log('skipped_no_track', {channelId})
		return
	}

	// Check if track is from v1 channel - these can't be broadcast
	const channel = channelsCollection.get(channelId)
	if (channel?.source === 'v1') {
		log.error('failed_v1_track', {channelId, trackId, channel})
		throw new Error('Cannot broadcast v1 channels')
	}

	await upsertRemoteBroadcast(channelId, trackId)
	log.log('created', {channelId, trackId})
}

/**
 * @param {string} channelId
 */
export async function stopBroadcast(channelId) {
	log.log('stop_requested', {channelId})
	if (!channelId) return
	try {
		await sdk.supabase.from('broadcast').delete().eq('channel_id', channelId).throwOnError()
		log.log('deleted remote broadcast', {channelId})
	} catch (error) {
		log.error('failed to delete remote broadcast', {
			channelId,
			error: /** @type {Error} */ (error).message
		})
	}
}

/**
 * Watch all broadcasts and call onChange when data changes
 * @param {(data: {broadcasts: import('$lib/types').BroadcastWithChannel[], error: string|null}) => void} onChange
 * @returns {() => void} unsubscribe function
 */
export function watchBroadcasts(onChange) {
	log.debug('watching for remote changes')

	// Load initial data
	readBroadcastsWithChannel()
		.then((broadcasts) => onChange({broadcasts, error: null}))
		.catch((error) => onChange({broadcasts: [], error: error.message}))

	/** @type {ReturnType<typeof sdk.supabase.channel> | null} */
	let watchChannel = sdk.supabase
		.channel('broadcasts-page')
		.on('postgres_changes', {event: '*', schema: 'public', table: 'broadcast'}, async (payload) => {
			const newData = /** @type {import('$lib/types').Broadcast | undefined} */ (payload.new)
			const oldData = /** @type {Partial<import('$lib/types').Broadcast> | undefined} */ (payload.old)
			const channelId = newData?.channel_id || oldData?.channel_id
			log.log('realtime_event', {
				event: payload.eventType,
				channel_id: channelId,
				track_id: newData?.track_id,
				old_track_id: oldData?.track_id
			})

			if (payload.eventType === 'DELETE' && channelId) {
				log.log('broadcast_removed_from_ui', {channel_id: channelId})

				// Clear local broadcasting state if this was our broadcast
				if (channelId === appState.channels?.[0]) {
					appState.broadcasting_channel_id = undefined
					log.log('my_broadcast_removed_remotely', {channel_id: channelId})
				}
			}

			// Reload and notify
			try {
				const broadcasts = await readBroadcastsWithChannel()
				onChange({broadcasts, error: null})
			} catch (error) {
				onChange({broadcasts: [], error: error.message})
			}
		})
		.subscribe((status) => {
			log.debug('broadcasts_subscription_status', {status})
		})

	return () => {
		if (watchChannel) {
			log.log('broadcasts_watch_stopped')
			watchChannel.unsubscribe()
			watchChannel = null
		}
	}
}

/** @param {string} channelId */
function startBroadcastSync(channelId) {
	stopBroadcastSync()

	log.log('starting_sync', {channelId})

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
				log.log('change_received', {
					channelId,
					track_id: broadcast.track_id,
					track_played_at: broadcast.track_played_at,
					payload_event: payload.eventType
				})
				playBroadcastTrack(broadcast)
			}
		)
		.subscribe((status) => {
			log.log('subscription_status', {channelId, status})
		})
}

export function stopBroadcastSync() {
	if (broadcastChannel) {
		log.log('stopping_sync')
		broadcastChannel.unsubscribe()
		broadcastChannel = null
	}
}

/**
 *  @param {import('$lib/types').Broadcast} broadcast
 * */
export async function playBroadcastTrack(broadcast) {
	const {track_id, channel_id} = broadcast

	try {
		await playTrack(track_id, null, 'broadcast_sync')
		appState.listening_to_channel_id = channel_id
		return true
	} catch {
		// if it failed, fetch channel tracks and retry
		try {
			// Get slug from channel (we have channel_id from broadcast)
			const channel = channelsCollection.get(channel_id)
			const slug = channel?.slug
			if (!slug) throw new Error('No channel found for broadcast')
			await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
			await playTrack(track_id, null, 'broadcast_sync')
			appState.listening_to_channel_id = channel_id
			log.log('play_success_after_fetch', {track_id, channel_id, slug})
			return true
		} catch (error) {
			log.error('failed_completely', {track_id, error: /** @type {Error} */ (error).message})
			return false
		}
	}
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
