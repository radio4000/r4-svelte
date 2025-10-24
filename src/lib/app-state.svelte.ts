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

// Reactive proxy - ergonomic API for all components
export const appState: AppState = $state({...defaultAppState})

let initialized = false

// Initialize: collection → appState, subscribe to cross-tab changes
export async function initAppState() {
	if (initialized) return
	try {
		const stored = appStateCollection.get(1)

		if (!stored) {
			// No stored state - insert defaults into collection
			appStateCollection.insert({...defaultAppState})
			log.log('init', 'inserted_defaults')
		} else {
			// Load from collection into reactive proxy
			stored.is_playing = false // Always reset on init
			Object.assign(appState, stored)
			log.log('init', stored)
		}

		// Subscribe to collection changes (cross-tab sync)
		appStateCollection.subscribeChanges((changes) => {
			for (const change of changes) {
				if (change.type === 'update' || change.type === 'insert') {
					// Update appState from collection (another tab changed it)
					Object.assign(appState, change.value)
					log.debug('synced_from_collection', change.value)
				}
			}
		})
	} catch (err) {
		log.warn('Failed to load app state from collection:', err)
	}
	initialized = true
}

// Persist: appState → collection (called from layout $effect)
export async function persistAppState() {
	if (!initialized) return

	// Sync reactive proxy to collection
	appStateCollection.update(1, (draft) => {
		Object.assign(draft, appState)
	})
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
