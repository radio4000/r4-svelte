import {logger} from '$lib/logger'
import {appStateCollection} from '$lib/collections'
import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
import {r4} from '$lib/r4'
import type {AppState} from './types.ts'

const log = logger.ns('app_state').seal()

/**
 * Reactive hook for components to access app state
 * Usage: const appState = useAppState()
 * Returns object with reactive getter for app state
 */
export function useAppState() {
	const query = useLiveQuery((q) => q.from({state: appStateCollection}).findOne())
	return {
		get current() {
			return query.data
		}
	}
}

export const defaultAppState: AppState = {
	id: 1,
	counter: 0,

	channels: [],
	custom_css_variables: {},
	shortcuts: {},

	channels_display: 'grid',
	channels_filter: '20+',
	channels_shuffled: true,
	queue_panel_visible: false,
	show_video_player: true,
	player_expanded: false,

	playlist_track: undefined,
	playlist_tracks: [],
	playlist_tracks_shuffled: [],

	is_playing: false,
	shuffle: false,
	volume: 0.7,

	broadcasting_channel_id: undefined,
	listening_to_channel_id: undefined,

	theme: undefined,
	hide_track_artwork: false,

	user: undefined
}

let initialized = false

/**
 * Initialize app state collection
 * Inserts default state if none exists
 */
export async function initAppState() {
	if (initialized) return
	try {
		// Wait a tick for localStorage collection to hydrate
		await new Promise((resolve) => setTimeout(resolve, 0))

		const stored = appStateCollection.get(1)
		log.log('init_check', {
			stored_exists: !!stored,
			hide_track_artwork: stored?.hide_track_artwork,
			collection_size: appStateCollection.toArray.length
		})

		if (!stored) {
			// No stored state - insert defaults into collection
			appStateCollection.insert({...defaultAppState})
			log.log('init', 'inserted_defaults')
		} else {
			// Reset is_playing on init
			appStateCollection.update(1, (draft) => {
				draft.is_playing = false
			})
			log.log('init', 'found_stored_state', {hide_track_artwork: stored.hide_track_artwork})
		}
	} catch (err) {
		log.warn('Failed to load app state from collection:', err)
	}
	initialized = true
}

/**
 * Validate that listening_to_channel_id points to an active broadcast
 * Clears invalid state
 */
export async function validateListeningState() {
	const state = appStateCollection.get(1)
	if (!state?.listening_to_channel_id) return

	try {
		const {data} = await r4.sdk.supabase
			.from('broadcast')
			.select('channel_id')
			.eq('channel_id', state.listening_to_channel_id)
			.single()

		if (!data) {
			log.log('clearing_invalid_listening_state', {
				invalid_channel_id: state.listening_to_channel_id
			})
			appStateCollection.update(1, (draft) => {
				draft.listening_to_channel_id = undefined
			})
		}
	} catch {
		log.log('clearing_invalid_listening_state_error', {
			invalid_channel_id: state.listening_to_channel_id
		})
		appStateCollection.update(1, (draft) => {
			draft.listening_to_channel_id = undefined
		})
	}
}
