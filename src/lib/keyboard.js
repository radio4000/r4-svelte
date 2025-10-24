import {createKeybindingsHandler} from 'tinykeys'
import {goto} from '$app/navigation'
import {toggleShuffle} from '$lib/api/player.js'
import {togglePlayerExpanded, openSearch, togglePlayPause, toggleQueuePanel} from '$lib/api.js'
import {appStateCollection} from '$lib/collections'

/** Maps keybinding to functions from api.js */
export const DEFAULT_KEY_BINDINGS = {
	f: 'togglePlayerExpanded',
	'$mod+k': 'openSearch',
	'/': 'openSearch',
	k: 'togglePlayPause',
	r: 'toggleQueuePanel',
	s: 'toggleShuffle',
	gs: 'gotoSettings'
}

export function initializeKeyboardShortcuts() {
	const keyBindings = appStateCollection.get(1)?.shortcuts || DEFAULT_KEY_BINDINGS
	const bindings = {}

	const actionMap = {
		toggleShuffle,
		togglePlayerExpanded,
		openSearch,
		togglePlayPause,
		toggleQueuePanel,
		gotoSettings: () => goto('/settings')
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
