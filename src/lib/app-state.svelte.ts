import type {AppState, Deck} from './types.ts'
import {logger} from '$lib/logger'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import {isMobileViewport} from '$lib/utils'

function resetTransientDeckState(deck: Deck): Deck {
	deck.queue_filter = undefined
	deck.playlist_tracks_filtered = undefined
	deck.is_playing = false
	deck.broadcasting_channel_id = undefined
	deck.listening_to_channel_id = undefined
	deck.auto_radio_drifted = undefined
	deck.listening_drifted = undefined
	deck.play_id = undefined
	deck.track_played_at = undefined
	deck.seeked_at = undefined
	deck.seek_position = undefined
	deck.media_current_time = undefined
	deck.media_duration = undefined
	deck.ms_listened = undefined
	return deck
}

export function normalizeLoadedDeck(id: number, deck?: Partial<Deck>): Deck {
	return resetTransientDeckState({...createDefaultDeck(id), ...(deck as Deck | undefined)})
}

export function serializeAppStateForStorage(state: AppState): Record<string, unknown> {
	const persistedState = {...state} as Record<string, unknown>
	const decks: Record<number, Partial<Deck>> = {}

	for (const [id, deck] of Object.entries(state.decks)) {
		if (deck.listening_to_channel_id) continue
		decks[Number(id)] = {
			id: deck.id,
			playlist_title: deck.playlist_title,
			playlist_slug: deck.playlist_slug,
			playlist_track: deck.playlist_track,
			shuffle: deck.shuffle,
			volume: deck.volume,
			muted: deck.muted,
			hide_video_player: deck.hide_video_player,
			video_mix: deck.video_mix,
			compact: deck.compact,
			expanded: deck.expanded,
			hide_queue_panel: deck.hide_queue_panel,
			queue_panel_width: deck.queue_panel_width,
			auto_radio: deck.auto_radio,
			view: deck.view,
			auto_radio_rotation_start: deck.auto_radio_rotation_start,
			speed: deck.speed
		}
	}

	persistedState.decks = decks
	return persistedState
}

export function serializeQueuesForStorage(decks: AppState['decks']) {
	const queues: Record<number, {playlist_tracks: string[]; playlist_tracks_shuffled: string[]}> = {}
	for (const [id, deck] of Object.entries(decks)) {
		if (deck.listening_to_channel_id) continue
		queues[Number(id)] = {
			playlist_tracks: deck.playlist_tracks,
			playlist_tracks_shuffled: deck.playlist_tracks_shuffled
		}
	}
	return queues
}

export function createDefaultDeck(id: number): Deck {
	return {
		id,
		playlist_title: undefined,
		playlist_slug: undefined,
		playlist_track: undefined,
		playlist_tracks: [],
		playlist_tracks_shuffled: [],
		is_playing: false,
		shuffle: false,
		volume: 1,
		muted: false,
		hide_video_player: false,
		video_mix: false,
		compact: false,
		expanded: false,
		hide_queue_panel: false,
		queue_panel_width: undefined,
		broadcasting_channel_id: undefined,
		listening_to_channel_id: undefined,
		track_played_at: undefined,
		seeked_at: undefined,
		seek_position: undefined,
		speed: 1
	}
}

const log = logger.ns('appstate').seal()

const STATE_KEY = LOCAL_STORAGE_KEYS.appState
const QUEUE_KEY = LOCAL_STORAGE_KEYS.appStateQueue

/**
 * The "app state" is a global, single reactive object shared across the app.
 * It can be mutated from anywhere, and persists to local storage.
 */
export const defaultAppState: AppState = {
	id: 1,

	decks: {1: {...createDefaultDeck(1), compact: true}},
	next_deck_id: 2,
	active_deck_id: 1,

	channels: [],
	local_channel_ids: [],
	local_channel_origins: {},
	local_channels: [],
	channel: undefined,
	custom_css_variables: {},
	shortcuts: undefined,

	channels_display: 'grid',
	channels_filter: 'featured',
	channels_order: 'shuffle',
	channels_order_direction: 'desc',

	theme: undefined,
	show_track_artwork: true,
	default_new_deck_volume: 1,
	autoplay_new_deck: true,
	show_speed_control: false,
	show_track_range_control: true,
	use_pointer_cursor: true,
	floating_ui: true,
	show_borders: true,
	font_family: undefined,

	user: undefined,

	embed_mode: false,

	language: undefined,
	modal_track_add: null,
	modal_track_edit: null,
	modal_shortcuts: false,
	modal_nav: false,
	show_welcome_hint: false,
	show_onboarding_hint: true,
	analytics_opt_in: false
}

// Load from local storage on module init
function loadState(): AppState {
	let state: AppState = {...defaultAppState, decks: {}}
	try {
		const storedState = typeof localStorage !== 'undefined' ? localStorage.getItem(STATE_KEY) : null
		if (storedState) {
			const parsed = JSON.parse(storedState)
			state = {...state, ...parsed}
			for (const [id, deck] of Object.entries(state.decks)) {
				state.decks[Number(id)] = normalizeLoadedDeck(Number(id), deck as Deck)
			}
		}
		// Queue arrays are stored separately to avoid serializing them on every small state change
		const storedQueue = typeof localStorage !== 'undefined' ? localStorage.getItem(QUEUE_KEY) : null
		if (storedQueue) {
			const queues = JSON.parse(storedQueue) as Record<
				string,
				{playlist_tracks?: string[]; playlist_tracks_shuffled?: string[]}
			>
			for (const [id, q] of Object.entries(queues)) {
				const deck = state.decks[Number(id)]
				if (deck) {
					deck.playlist_tracks = q.playlist_tracks ?? []
					deck.playlist_tracks_shuffled = q.playlist_tracks_shuffled ?? []
				}
			}
		}
	} catch (err) {
		log.warn('Failed to load app state:', err)
	}

	// Always reset transient state on all decks
	for (const deck of Object.values(state.decks)) {
		resetTransientDeckState(deck)
	}

	const deckIds = Object.keys(state.decks)
		.map(Number)
		.filter((id) => Number.isFinite(id))
		.sort((a, b) => a - b)
	if (deckIds.length === 0) {
		state.decks = {}
		state.active_deck_id = 1
		state.next_deck_id = 2
	} else {
		if (!state.active_deck_id || !state.decks[state.active_deck_id]) {
			state.active_deck_id = deckIds[0]
		}
		const maxId = deckIds.at(-1) ?? 0
		state.next_deck_id = Math.max(state.next_deck_id ?? 1, maxId + 1)
	}

	return state
}

export const appState: AppState = $state(loadState())

/** Non-persisted runtime auth status. channelChecked becomes true after the first checkUser() resolves. */
export const authStatus = $state({channelChecked: false})

/** Can the current user edit this channel? (Supabase-owned only) */
export function canEditChannel(channelId: string | undefined): boolean {
	return !!channelId && !!appState.user && !!appState.channels?.includes(channelId)
}

/** Is this a locally imported channel (not from remote DB)? */
export function isLocalChannel(channelId: string | undefined): boolean {
	return !!channelId && !!appState.local_channel_ids?.includes(channelId)
}

export const DECK_ACCENTS = [
	'hsl(17 70% 55%)',
	'hsl(221 35% 54%)',
	'hsl(150 50% 50%)',
	'hsl(280 40% 55%)',
	'hsl(35 70% 55%)',
	'hsl(190 50% 50%)'
]

/** Accent color for a deck. Uses (deckId - 1) so each deck always maps to the same color regardless of how many exist. */
export function deckAccent(deckIds: number[], deckId: number): string | undefined {
	if (deckIds.length < 2) return undefined
	return DECK_ACCENTS[(deckId - 1) % DECK_ACCENTS.length]
}

/** Add a new deck, returns it */
export function addDeck(): Deck {
	const id = appState.next_deck_id
	const deck = createDefaultDeck(id)
	deck.volume = appState.default_new_deck_volume ?? 1
	deck.muted = deck.volume === 0
	// Mobile decks are either compact or expanded — never in the strip
	if (isMobileViewport()) deck.compact = true
	appState.decks[id] = deck
	appState.next_deck_id = id + 1
	return deck
}

/** Remove a deck by ID. When the last deck is removed, reset to an empty deck 1 that auto-hides. */
export function removeDeck(deckId: number): void {
	delete appState.decks[deckId]
	const remainingIds = Object.keys(appState.decks)
	if (remainingIds.length === 0) {
		appState.active_deck_id = 1
		appState.next_deck_id = 2
		return
	}
	// Reset active deck if removed
	if (appState.active_deck_id === deckId) {
		appState.active_deck_id = Number(remainingIds[0])
	}
}

// Persist state in two groups to avoid serializing large queue arrays on every small change.
// STATE_KEY: everything except playlist_tracks/playlist_tracks_shuffled
// QUEUE_KEY: just the queue arrays per deck
$effect.root(() => {
	$effect(() => {
		localStorage.setItem(STATE_KEY, JSON.stringify(serializeAppStateForStorage(appState)))
	})
	$effect(() => {
		localStorage.setItem(QUEUE_KEY, JSON.stringify(serializeQueuesForStorage(appState.decks)))
	})
})
