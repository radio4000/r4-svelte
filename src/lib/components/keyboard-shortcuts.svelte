<script>
	/** Initializes global keyboard handling for the app. */
	import {initializeKeyboardShortcuts} from '#lib/keyboard.js'

	$effect(() => {
		const cleanup = initializeKeyboardShortcuts()
		return () => {
			cleanup()
		}
	})
</script>
