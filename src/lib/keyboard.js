import {createKeybindingsHandler} from 'tinykeys'
import {goto} from '$app/navigation'
import {openSearch, togglePlayPause, clearQueue, toggleShuffle} from '$lib/api'
import {appState} from '$lib/app-state.svelte'

/** Maps keybinding to functions from api.ts */
export const DEFAULT_KEY_BINDINGS = {
	'/': 'openSearch',
	k: 'togglePlayPause',
	s: 'toggleShuffle',
	'g h': 'gotoHome',
	'g s': 'gotoSettings',
	'g d': 'gotoDebug',
	'Shift+Slash': 'showShortcutsHelp'
}

let activeCleanup = null

export function initializeKeyboardShortcuts() {
	if (activeCleanup) activeCleanup()
	const keyBindings = {...DEFAULT_KEY_BINDINGS, ...appState.shortcuts}
	const bindings = {}

	const actionMap = {
		toggleShuffle: () => toggleShuffle(appState.active_deck_id),
		openSearch,
		togglePlayPause: () => togglePlayPause(appState.active_deck_id),
		clearQueue: () => clearQueue(appState.active_deck_id),
		gotoHome: () => goto('/'),
		gotoSettings: () => goto('/settings'),
		gotoDebug: () => goto('/_debug'),
		showShortcutsHelp: () => {
			appState.modal_shortcuts = true
		}
	}

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

	const handler = createKeybindingsHandler(bindings)
	window.addEventListener('keydown', handler)
	activeCleanup = () => {
		window.removeEventListener('keydown', handler)
		activeCleanup = null
	}
	return activeCleanup
}
