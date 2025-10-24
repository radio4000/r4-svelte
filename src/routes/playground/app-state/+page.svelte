<script>
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'

	const appState = useAppState().current

	function toggleHideArtwork() {
		console.log('before toggle:', appState?.hide_track_artwork)
		appStateCollection.update(1, (draft) => {
			draft.hide_track_artwork = !draft.hide_track_artwork
			console.log('inside update:', draft.hide_track_artwork)
		})
		console.log('after update:', appState?.hide_track_artwork)
	}

	function setHideArtworkTrue() {
		console.log('setting to true')
		appStateCollection.update(1, (draft) => {
			draft.hide_track_artwork = true
		})
	}

	function setHideArtworkFalse() {
		console.log('setting to false')
		appStateCollection.update(1, (draft) => {
			draft.hide_track_artwork = false
		})
	}

	function logCurrentState() {
		console.log('appState from query:', appState)
		console.log('hide_track_artwork:', appState?.hide_track_artwork)
		console.log('collection direct:', appStateCollection.get(1))
		console.log('localStorage:', JSON.parse(localStorage.getItem('r5-app-state') || '{}'))
	}

	function debugQuery() {
		console.log('appState:', appState)
		console.log('typeof appState:', typeof appState)
		console.log('Array.isArray(appState):', Array.isArray(appState))
		console.log('collection direct:', appStateCollection.get(1))
	}
</script>

<div>
	<h1>App State Persistence Test</h1>

	<p>Current value: <strong>{appState?.hide_track_artwork}</strong></p>

	<button onclick={toggleHideArtwork}>Toggle hide_track_artwork</button>
	<button onclick={setHideArtworkTrue}>Set to TRUE</button>
	<button onclick={setHideArtworkFalse}>Set to FALSE</button>
	<button onclick={logCurrentState}>Log all state</button>
	<button onclick={debugQuery}>Debug Query Object</button>

	<h2>Instructions:</h2>
	<ol>
		<li>Click "Toggle" or set to true/false</li>
		<li>Check console for logs</li>
		<li>Check if value on page updates</li>
		<li>Check localStorage in devtools</li>
		<li>Reload page and see if value persists</li>
	</ol>

	<h2>Checkbox test (like theme-editor):</h2>
	<label>
		<input
			type="checkbox"
			checked={appState?.hide_track_artwork}
			onchange={(e) => {
				console.log('checkbox onchange fired!', e.target.checked)
				appStateCollection.update(1, (draft) => {
					draft.hide_track_artwork = e.target.checked
				})
			}}
		/>
		hide_track_artwork (checkbox)
	</label>
</div>
