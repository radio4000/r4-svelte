import {goto} from '$app/navigation'
import {resolve} from '$app/paths'
import {appState} from '#lib/app-state.svelte.js'

/** @param value 'light', 'dark', or undefined for system */
export function setTheme(value: string | undefined) {
	document.documentElement.classList.toggle('dark', value === 'dark')
	document.documentElement.classList.toggle('light', value === 'light')
	appState.theme = value
}

/** Cycle theme: system default, light, dark. */
export function toggleTheme() {
	const cycle: Array<string | undefined> = [undefined, 'light', 'dark']
	setTheme(cycle[(cycle.indexOf(appState.theme) + 1) % cycle.length])
}

/** Focus the search input if a deck is visible to make room for it, else navigate to /search. */
export function openSearch(event?: KeyboardEvent) {
	event?.preventDefault()
	const hasVisibleDeck = Object.values(appState.decks).some((d) => !d.compact)
	if (hasVisibleDeck) {
		const searchInput = document.querySelector('input[type="search"]')
		if (searchInput instanceof HTMLInputElement && searchInput.checkVisibility()) {
			searchInput.focus()
			return
		}
	}
	goto(resolve('search'))
}
