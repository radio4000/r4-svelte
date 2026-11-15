import {untrack} from 'svelte'

/**
 * Call `onChange` with `read()` now and whenever state that `read` reads changes, a
 * microtask later, batched per task. `onChange` runs untracked. Returns a stop function.
 */
export function watch<T>(read: () => T, onChange: (value: T) => void): () => void {
	return $effect.root(() => {
		$effect(() => {
			const value = read()
			untrack(() => onChange(value))
		})
	})
}
