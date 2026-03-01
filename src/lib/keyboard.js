import {createKeybindingsHandler} from 'tinykeys'
import {goto} from '$app/navigation'
import {openSearch, togglePlayPause, clearQueue, toggleShuffle, toggleDeckCompact} from '$lib/api'
import {appState} from '$lib/app-state.svelte'

/** Maps keybinding to functions from api.ts */
export const DEFAULT_KEY_BINDINGS = {
	'/': 'openSearch',
	k: 'togglePlayPause',
	s: 'toggleShuffle',
	r: 'toggleCompactDeck',
	'g h': 'gotoHome',
	'g s': 'gotoSettings',
	'g d': 'gotoDebug',
	'Shift+Slash': 'showShortcutsHelp'
}

/** Single stable listener — swap the inner handler instead of add/remove */
let currentHandler = null
let listenerAttached = false

function onKeyDown(event) {
	if (currentHandler) currentHandler(event)
}

export function initializeKeyboardShortcuts() {
	const keyBindings = {...DEFAULT_KEY_BINDINGS, ...appState.shortcuts}

	const actionMap = {
		toggleShuffle: () => toggleShuffle(appState.active_deck_id),
		openSearch,
		togglePlayPause: () => togglePlayPause(appState.active_deck_id),
		clearQueue: () => clearQueue(appState.active_deck_id),
		toggleCompactDeck: () => toggleDeckCompact(appState.active_deck_id),
		gotoHome: () => goto('/'),
		gotoSettings: () => goto('/settings'),
		gotoDebug: () => goto('/_debug'),
		showShortcutsHelp: () => {
			appState.modal_shortcuts = true
		}
	}

	const bindings = {}
	for (const [key, actionName] of Object.entries(keyBindings)) {
		const actionFn = actionMap[actionName]
		if (actionFn) {
			bindings[key] = (event) => {
				if (
					event.target instanceof HTMLInputElement ||
					event.target instanceof HTMLTextAreaElement ||
					event.target instanceof HTMLSelectElement ||
					event.target.tagName === 'DATALIST'
				) {
					return
				}
				actionFn(event)
			}
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
