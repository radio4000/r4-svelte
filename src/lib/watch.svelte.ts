import {untrack} from 'svelte'

/**
 * Call `onChange` with `read()` now and whenever state that `read` reads changes.
 * For plain modules that react to app state (broadcast.js watching the decks).
 * Runs a microtask after the change, batched: several writes in one task call it once.
 * `onChange` runs untracked, so what it reads doesn't subscribe. Returns a stop function.
 */
export function watch<T>(read: () => T, onChange: (value: T) => void): () => void {
	return $effect.root(() => {
		$effect(() => {
			const value = read()
			untrack(() => onChange(value))
		})
	})
}
