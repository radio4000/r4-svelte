import {logger} from '$lib/logger'
import {appStateCollection} from '$lib/collections'
import type {AppState} from './types.ts'

const log = logger.ns('app_state').seal()

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

export const appState: AppState = $state({...defaultAppState})

let initialized = false

// Initialize from localStorage collection
export async function initAppState() {
	if (initialized) return
	try {
		// Get current state from collection (localStorage)
		const items = appStateCollection.getAll()
		const stored = items.find((item) => item.id === 1)

		log.log('init', stored)

		if (stored) {
			// Always override is_playing to false
			stored.is_playing = false
			Object.assign(appState, stored)
		} else {
			// Initialize with default state
			appStateCollection.upsert(defaultAppState)
		}
	} catch (err) {
		log.warn('Failed to load app state from collection:', err)
	}
	initialized = true
}

/** Persist to localStorage collection */
export async function persistAppState() {
	if (!initialized) return
	appStateCollection.upsert(appState)
}

/** Validate that listening_to_channel_id points to an active broadcast */
export async function validateListeningState() {
	if (!appState.listening_to_channel_id) return

	try {
		const {r4} = await import('$lib/r4')
		const {data} = await r4.sdk.supabase
			.from('broadcast')
			.select('channel_id')
			.eq('channel_id', appState.listening_to_channel_id)
			.single()

		if (!data) {
			log.log('clearing_invalid_listening_state', {
				invalid_channel_id: appState.listening_to_channel_id
			})
			appState.listening_to_channel_id = undefined
		}
	} catch {
		log.log('clearing_invalid_listening_state_error', {
			invalid_channel_id: appState.listening_to_channel_id
		})
		appState.listening_to_channel_id = undefined
	}
}
