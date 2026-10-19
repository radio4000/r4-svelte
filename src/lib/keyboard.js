import {createKeybindingsHandler} from 'tinykeys'
import {goto} from '$app/navigation'
import {page} from '$app/state'
import {
	openSearch,
	togglePlayPause,
	toggleChannelPlay,
	clearQueue,
	toggleShuffle,
	toggleDeckCompact,
	toggleTheme,
	next,
	previous
} from '#lib/api.js'
import {appState} from '#lib/app-state.svelte.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {isMobileViewport} from '#lib/utils.js'
import * as m from '#lib/paraglide/messages.js'

/**
 * `k`: plain play/pause, except on a channel page with nothing loaded on the
 * active deck — then start that channel, same as the header play button.
 */
function togglePlayOrStartChannel() {
	const deckId = appState.active_deck_id
	const slug = page.params.slug
	if (slug && !appState.decks[deckId]?.playlist_track) {
		const channel = [...channelsCollection.state.values()].find((c) => c?.slug === slug)
		if (channel) return toggleChannelPlay(channel, page.params.tid)
	}
	return togglePlayPause(deckId)
}

function gotoIfAllowed(path) {
	if (appState.embed_mode) return
	goto(path)
}

/**
 * Single registry for keyboard actions. Add a new action here and it's
 * picked up by the default bindings, the editor list, and the help dialog.
 * `label` is optional — falls back to the action name.
 */
export const SHORTCUT_ACTIONS = {
	openSearch: {
		default: '/',
		label: () => m.shortcuts_action_openSearch(),
		run: (event) => openSearch(event)
	},
	togglePlayPause: {
		default: 'k',
		label: () => m.shortcuts_action_togglePlayPause(),
		run: () => togglePlayOrStartChannel()
	},
	nextTrack: {
		default: 'Shift+N',
		label: () => m.player_tooltip_next(),
		run: () => next(appState.active_deck_id, 'user_next')
	},
	previousTrack: {
		default: 'Shift+P',
		label: () => m.player_tooltip_prev(),
		run: () => previous(appState.active_deck_id, 'user_prev')
	},
	toggleShuffle: {
		default: 's',
		label: () => m.shortcuts_action_toggleShuffle(),
		run: () => toggleShuffle(appState.active_deck_id)
	},
	toggleCompactDeck: {
		default: 'r',
		label: () => m.shortcuts_action_toggleCompactDeck(),
		run: () => toggleDeckCompact(appState.active_deck_id)
	},
	clearQueue: {
		run: () => clearQueue(appState.active_deck_id)
	},
	collapseExpandedDeck: {
		default: 'Escape',
		run: () => {
			// Mobile-only: expanded deck is a fullscreen takeover there. On
			// desktop it's a deliberate layout state — leave Escape alone.
			if (!isMobileViewport()) return
			// Native Escape consumers go first: fullscreen, dialogs, popovers.
			if (document.fullscreenElement) return
			if (document.querySelector('dialog[open], :popover-open')) return
			const expanded = Object.entries(appState.decks).find(([, d]) => d.expanded)
			if (expanded) toggleDeckCompact(Number(expanded[0]))
		}
	},
	toggleTheme: {
		default: 't',
		run: () => toggleTheme()
	},
	gotoHome: {
		default: 'g h',
		label: () => m.shortcuts_action_gotoHome(),
		run: () => gotoIfAllowed('/')
	},
	gotoSettings: {
		default: 'g s',
		label: () => m.shortcuts_action_gotoSettings(),
		run: () => gotoIfAllowed('/settings')
	},
	gotoDocs: {
		default: 'g d',
		label: () => m.shortcuts_action_gotoDocs(),
		run: () => gotoIfAllowed('/docs')
	},
	openNavPalette: {
		default: '$mod+k',
		run: () => {
			appState.modal_nav = true
		}
	},
	showShortcutsHelp: {
		default: 'Shift+Slash',
		label: () => m.shortcuts_action_showShortcutsHelp(),
		run: () => {
			appState.modal_shortcuts = true
		}
	}
}

/** Maps keybinding to action name, derived from SHORTCUT_ACTIONS. */
export const DEFAULT_KEY_BINDINGS = Object.fromEntries(
	Object.entries(SHORTCUT_ACTIONS)
		.filter(([, a]) => a.default)
		.map(([name, a]) => [a.default, name])
)

export function getActionLabel(name) {
	return SHORTCUT_ACTIONS[name]?.label?.() ?? name
}

/**
 * The key currently bound to an action (user override wins over default), or
 * undefined when unbound.
 * @param {string} name
 */
function getActionKey(name) {
	const bindings = {...DEFAULT_KEY_BINDINGS, ...appState.shortcuts}
	return Object.entries(bindings).find(([, action]) => action === name)?.[0] || undefined
}

/**
 * Tooltip `<kbd>` hint for an action's current key, e.g. ` <kbd>R</kbd>`.
 * Empty string when unbound. Single-char keys are uppercased to match the
 * player transport tooltips. Read inside a reactive scope for live updates.
 * @param {string} name
 */
export function shortcutHint(name) {
	const key = getActionKey(name)
	if (!key) return ''
	return ` <kbd>${key.length === 1 ? key.toUpperCase() : key}</kbd>`
}

/** Single stable listener — swap the inner handler instead of add/remove */
/** @type {EventListener | null} */
let currentHandler = null
let listenerAttached = false

function onKeyDown(event) {
	if (currentHandler) currentHandler(event)
}

export function initializeKeyboardShortcuts() {
	const keyBindings = {...DEFAULT_KEY_BINDINGS, ...appState.shortcuts}
	/** @type {import('tinykeys').KeybindingsMap} */
	const bindings = {}
	for (const [key, actionName] of Object.entries(keyBindings)) {
		const action = SHORTCUT_ACTIONS[actionName]
		if (!action) continue
		bindings[key] = (event) => {
			const target = event.target
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.tagName === 'DATALIST')
			) {
				return
			}
			action.run(event)
		}
	}

	currentHandler = createKeybindingsHandler(bindings)

	if (!listenerAttached) {
		window.addEventListener('keydown', onKeyDown)
		listenerAttached = true
	}

	return () => {
		currentHandler = null
		if (listenerAttached) {
			window.removeEventListener('keydown', onKeyDown)
			listenerAttached = false
		}
	}
}
