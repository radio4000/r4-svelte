<script>
	import {resetLocalData} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import InputRange from '$lib/components/input-range.svelte'

	function clearAll() {
		if (!confirm('Clear ALL data (localStorage + IndexedDB)? Page will reload.')) return
		resetLocalData()
		location.reload()
	}
</script>

<div class="constrained">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>App State</h1>
	<p>
		Global reactive state persisted to localStorage. Changes here reflect immediately across the
		app. Also available at <code>window.r5.appState</code>.
	</p>

	<section>
		<p>
			Clears any custom, local user settings, application state as well as cached channels and
			tracks in idb.
		</p>
		<button onclick={clearAll}>Reset localstorage + IndexedDB</button>
	</section>

	<section>
		<h2>Reactivity tests</h2>
		{#if appState.decks[1]}
			<InputRange bind:value={appState.decks[1].volume} min={0} max={1} step={0.1} />
			<p>Volume: {appState.decks[1].volume}</p>
		{/if}
	</section>
</div>

<style>
	section {
		margin-block-start: 1rem;
	}
</style>
