<script>
	import {initializeKeyboardShortcuts} from '#lib/keyboard.js'

	$effect(() => {
		const cleanup = initializeKeyboardShortcuts()
		return () => {
			cleanup()
		}
	})
</script>
