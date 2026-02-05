import type {AppState} from './types.ts'
import {logger} from '$lib/logger'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

const log = logger.ns('appstate').seal()

// Internally, for performance reasons, we split a couple of keys
// into their own localstorage group to avoid serializing them on every change.
const STATE_KEY = LOCAL_STORAGE_KEYS.appState
const QUEUE_KEY = LOCAL_STORAGE_KEYS.appStateQueue

/**
 * The "app state" is a global, single reactive object shared across the app.
 * It can be mutated from anywhere, and persists to local storage.
 */
export const defaultAppState: AppState = {
	id: 1,

	channels: [],
	channel: undefined,
	custom_css_variables: {},
	shortcuts: undefined,

	channels_display: 'grid',
	channels_filter: '10+',
	channels_order: 'updated',
	channels_order_direction: 'desc',
	channels_shuffled: true,
	queue_panel_visible: false,
	queue_panel_width: undefined,
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

	user: undefined,

	language: undefined,
	modal_track_add: null,
	modal_track_edit: null,
	modal_shortcuts: false
}

// Load from local storage on module init
function loadState(): AppState {
	let state = {...defaultAppState}
	try {
		const storedState = localStorage.getItem(STATE_KEY)
		if (storedState) {
			const parsed = JSON.parse(storedState)
			state = {...state, ...parsed}
		}
		const storedQueue = localStorage.getItem(QUEUE_KEY)
		if (storedQueue) {
			const parsed = JSON.parse(storedQueue)
			state.playlist_tracks = parsed.playlist_tracks ?? []
			state.playlist_tracks_shuffled = parsed.playlist_tracks_shuffled ?? []
		}
	} catch (err) {
		log.warn('Failed to load app state:', err)
	}
	state.is_playing = false
	state.listening_to_channel_id = undefined
	return state
}

export const appState: AppState = $state(loadState())

// Persist queue (large arrays) - only runs when these specific properties change
$effect.root(() => {
	$effect(() => {
		const queue = {
			playlist_tracks: appState.playlist_tracks,
			playlist_tracks_shuffled: appState.playlist_tracks_shuffled
		}
		localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
	})
})

// Persist state (everything except queue arrays)
$effect.root(() => {
	$effect(() => {
		const state = {...appState} as Partial<AppState>
		delete state.playlist_tracks
		delete state.playlist_tracks_shuffled
		localStorage.setItem(STATE_KEY, JSON.stringify(state))
	})
})
