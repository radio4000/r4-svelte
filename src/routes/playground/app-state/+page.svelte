<script>
	import {useAppState} from '$lib/app-state.svelte'

	const appState = useAppState()

	function toggle() {
		// Clean write syntax!
		appState.hide_track_artwork = !appState.hide_track_artwork
	}
</script>

<div>
	<h1>✅ Proxy Pattern with Property Accessors</h1>
	<p>Value: <strong>{appState.hide_track_artwork}</strong></p>
	<button onclick={toggle}>Toggle</button>
</div>
