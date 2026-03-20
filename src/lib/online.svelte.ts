import {onMount} from 'svelte'

/** Reactive online/offline state. Must be called during component init. */
export function useOnline() {
	let online = $state(true)

	onMount(() => {
		const update = () => (online = navigator.onLine)
		update()
		window.addEventListener('online', update)
		window.addEventListener('offline', update)
		return () => {
			window.removeEventListener('online', update)
			window.removeEventListener('offline', update)
		}
	})

	return {
		get online() {
			return online
		}
	}
}
