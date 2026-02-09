import type {AppState, Deck} from './types.ts'
import {createDefaultDeck} from './types.ts'
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

	decks: {1: createDefaultDeck(1)},
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
	font_family: undefined,

	user: undefined,

	language: undefined,
	modal_track_add: null,
	modal_track_edit: null,
	modal_shortcuts: false
}

// Load from local storage on module init
function loadState(): AppState {
	let state = {...defaultAppState, decks: {1: createDefaultDeck(1)}}
	try {
		const storedState = localStorage.getItem(STATE_KEY)
		if (storedState) {
			const parsed = JSON.parse(storedState)

			// Migration: detect old format (has playlist_track at top level, no decks key)
			if (!parsed.decks && ('playlist_track' in parsed || 'is_playing' in parsed || 'volume' in parsed)) {
				log.log('migrating old state to deck format')
				const deck = createDefaultDeck(1)
				deck.playlist_track = parsed.playlist_track
				deck.is_playing = false // always reset
				deck.shuffle = parsed.shuffle ?? false
				deck.volume = parsed.volume ?? 0.7
				deck.show_video_player = parsed.show_video_player ?? true
				deck.expanded = parsed.player_expanded ?? false
				deck.queue_panel_visible = parsed.queue_panel_visible ?? false
				deck.queue_panel_width = parsed.queue_panel_width
				deck.broadcasting_channel_id = parsed.broadcasting_channel_id
				deck.listening_to_channel_id = undefined // always reset

				// Remove old flat player fields before merging
				for (const key of [
					'playlist_track',
					'playlist_tracks',
					'playlist_tracks_shuffled',
					'is_playing',
					'shuffle',
					'volume',
					'show_video_player',
					'player_expanded',
					'queue_panel_visible',
					'queue_panel_width',
					'broadcasting_channel_id',
					'listening_to_channel_id'
				])
					delete (parsed as Record<string, unknown>)[key]

				state = {...state, ...parsed, decks: {1: deck}, next_deck_id: 2}
			} else if (parsed.decks) {
				// New format: merge decks
				state = {...state, ...parsed}
				// Ensure each deck has all fields from createDefaultDeck
				for (const [id, deck] of Object.entries(state.decks)) {
					state.decks[Number(id)] = {...createDefaultDeck(Number(id)), ...(deck as Deck)}
				}
			} else {
				state = {...state, ...parsed}
			}
		}

		// Migrate old queue format into deck 1
		const storedQueue = localStorage.getItem(QUEUE_KEY)
		if (storedQueue) {
			const parsed = JSON.parse(storedQueue)
			if (parsed.decks) {
				// New queue format: {decks: {1: {playlist_tracks, playlist_tracks_shuffled}, ...}}
				for (const [id, queueData] of Object.entries(parsed.decks)) {
					const deckId = Number(id)
					if (state.decks[deckId]) {
						const q = queueData as {playlist_tracks?: string[]; playlist_tracks_shuffled?: string[]}
						state.decks[deckId].playlist_tracks = q.playlist_tracks ?? []
						state.decks[deckId].playlist_tracks_shuffled = q.playlist_tracks_shuffled ?? []
					}
				}
			} else {
				// Old queue format: {playlist_tracks, playlist_tracks_shuffled}
				if (state.decks[1]) {
					state.decks[1].playlist_tracks = parsed.playlist_tracks ?? []
					state.decks[1].playlist_tracks_shuffled = parsed.playlist_tracks_shuffled ?? []
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
		const deck = createDefaultDeck(1)
		state.decks = {1: deck}
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

/** Get a deck by ID */
export function getDeck(deckId: number): Deck | undefined {
	return appState.decks[deckId]
}

/** Add a new deck, returns it */
export function addDeck(): Deck {
	const id = appState.next_deck_id
	const deck = createDefaultDeck(id)
	deck.volume = 0
	appState.decks[id] = deck
	appState.next_deck_id = id + 1
	return deck
}

/** Remove a deck by ID (cannot remove the last deck) */
export function removeDeck(deckId: number): void {
	delete appState.decks[deckId]
	const remainingIds = Object.keys(appState.decks)
	if (remainingIds.length === 0) {
		const deck = createDefaultDeck(1)
		appState.decks = {1: deck}
		appState.active_deck_id = 1
		appState.next_deck_id = 2
		return
	}
	// Reset active deck if removed
	if (appState.active_deck_id === deckId) {
		appState.active_deck_id = Number(remainingIds[0])
	}
}

// Persist queue (large arrays) per deck
$effect.root(() => {
	$effect(() => {
		const decksQueue: Record<number, {playlist_tracks: string[]; playlist_tracks_shuffled: string[]}> = {}
		for (const [id, deck] of Object.entries(appState.decks)) {
			decksQueue[Number(id)] = {
				playlist_tracks: deck.playlist_tracks,
				playlist_tracks_shuffled: deck.playlist_tracks_shuffled
			}
		}
		localStorage.setItem(QUEUE_KEY, JSON.stringify({decks: decksQueue}))
	})
})

// Persist state (everything except queue arrays inside decks)
$effect.root(() => {
	$effect(() => {
		const state = {...appState} as Record<string, unknown>
		// Deep clone decks, stripping queue arrays
		const decks: Record<number, Partial<Deck>> = {}
		for (const [id, deck] of Object.entries(appState.decks)) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const {playlist_tracks: _q, playlist_tracks_shuffled: _qs, ...rest} = deck
			decks[Number(id)] = rest
		}
		state.decks = decks
		localStorage.setItem(STATE_KEY, JSON.stringify(state))
	})
})
