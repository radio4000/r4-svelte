import type {AppState} from './types.ts'
import {logger} from '$lib/logger'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'

const log = logger.ns('appstate').seal()

/** The "app state" is a global, single reactive object shared across the app. Can be freely mutated anywhere directly. It persists to local storage automatically. */

const STORAGE_KEY = LOCAL_STORAGE_KEYS.appState

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
	modal_track_edit: null
}

// Load from local storage on module init
function loadState(): AppState {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored) {
			const parsed = JSON.parse(stored)
			parsed.is_playing = false
			parsed.listening_to_channel_id = undefined
			return {...defaultAppState, ...parsed}
		}
	} catch (err) {
		log.warn('Failed to load app state:', err)
	}
	return {...defaultAppState}
}

export const appState: AppState = $state(loadState())

// Auto-persist on changes. Dunno why we have this effect.root and nested?
$effect.root(() => {
	$effect(() => {
		const serialized = JSON.stringify(appState)
		const timeout = setTimeout(() => {
			localStorage.setItem(STORAGE_KEY, serialized)
		}, 200)
		return () => clearTimeout(timeout)
	})
})
