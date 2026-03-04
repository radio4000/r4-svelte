import type {AppState, Deck} from './types.ts'
import {logger} from '$lib/logger'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
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
	channel: undefined,
	custom_css_variables: {},
	shortcuts: undefined,

	channels_display: 'grid',
	channels_filter: '10+',
	channels_order: 'shuffle',
	channels_order_direction: 'desc',

	theme: undefined,
	hide_track_artwork: false,
	default_new_deck_volume: 1,
	autoplay_new_deck: true,
	show_speed_control: false,
	show_track_range_control: false,
	use_pointer_cursor: false,
	font_family: undefined,

	user: undefined,

	language: undefined,
	modal_track_add: null,
	modal_track_edit: null,
	modal_shortcuts: false,
	show_welcome_hint: true
}

// Load from local storage on module init
function loadState(): AppState {
	let state: AppState = {...defaultAppState, decks: {}}
	try {
		const storedState = localStorage.getItem(STATE_KEY)
		if (storedState) {
			const parsed = JSON.parse(storedState)
			state = {...state, ...parsed}
			for (const [id, deck] of Object.entries(state.decks)) {
				state.decks[Number(id)] = {...createDefaultDeck(Number(id)), ...(deck as Deck)}
			}
		}
		// Queue arrays are stored separately to avoid serializing them on every small state change
		const storedQueue = localStorage.getItem(QUEUE_KEY)
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
		deck.is_playing = false
		deck.listening_to_channel_id = undefined
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

/** Can the current user edit this channel? */
export function canEditChannel(channelId: string | undefined): boolean {
	return !!channelId && !!appState.user && !!appState.channels?.includes(channelId)
}

export const DECK_ACCENTS = [
	'hsl(17 70% 55%)',
	'hsl(221 35% 54%)',
	'hsl(150 50% 50%)',
	'hsl(280 40% 55%)',
	'hsl(35 70% 55%)',
	'hsl(190 50% 50%)'
]

/** Accent color for a deck by index. Returns undefined when only one deck exists. */
export function deckAccent(deckIds: number[], deckId: number): string | undefined {
	if (deckIds.length < 2) return undefined
	return DECK_ACCENTS[deckIds.indexOf(deckId) % DECK_ACCENTS.length]
}

/** Add a new deck, returns it */
export function addDeck(): Deck {
	const id = appState.next_deck_id
	const deck = createDefaultDeck(id)
	deck.volume = appState.default_new_deck_volume ?? 1
	deck.muted = deck.volume === 0
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
		const state = {...appState} as Record<string, unknown>
		const decks: Record<number, Partial<Deck>> = {}
		for (const [id, deck] of Object.entries(appState.decks)) {
			if (deck.listening_to_channel_id) continue
			const d = {...deck} as Partial<Deck>
			delete d.playlist_tracks
			delete d.playlist_tracks_shuffled
			decks[Number(id)] = d
		}
		state.decks = decks
		localStorage.setItem(STATE_KEY, JSON.stringify(state))
	})
	$effect(() => {
		const queues: Record<number, {playlist_tracks: string[]; playlist_tracks_shuffled: string[]}> = {}
		for (const [id, deck] of Object.entries(appState.decks)) {
			if (deck.listening_to_channel_id) continue
			queues[Number(id)] = {
				playlist_tracks: deck.playlist_tracks,
				playlist_tracks_shuffled: deck.playlist_tracks_shuffled
			}
		}
		localStorage.setItem(QUEUE_KEY, JSON.stringify(queues))
	})
})
