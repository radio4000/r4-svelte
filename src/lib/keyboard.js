import {createKeybindingsHandler} from 'tinykeys'
import {goto} from '$app/navigation'
import {
	togglePlayerExpanded,
	openSearch,
	togglePlayPause,
	toggleQueuePanel,
	clearQueue,
	toggleShuffle
} from '$lib/api.js'
import {appState} from '$lib/app-state.svelte'

/** Maps keybinding to functions from api.js */
export const DEFAULT_KEY_BINDINGS = {
	'/': 'openSearch',
	f: 'togglePlayerExpanded',
	k: 'togglePlayPause',
	r: 'toggleQueuePanel',
	s: 'toggleShuffle',
	gs: 'gotoSettings',
	'Shift+Slash': 'showShortcutsHelp'
}

export function initializeKeyboardShortcuts() {
	const keyBindings = {...DEFAULT_KEY_BINDINGS, ...appState.shortcuts}
	const bindings = {}

	const actionMap = {
		toggleShuffle,
		togglePlayerExpanded,
		openSearch,
		togglePlayPause,
		toggleQueuePanel,
		clearQueue,
		gotoSettings: () => goto('/settings'),
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
	return () => window.removeEventListener('keydown', handler)
}
