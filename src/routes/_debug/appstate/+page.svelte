<script>
	import {toggleQueuePanel, resetLocalData} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import InputRange from '$lib/components/input-range.svelte'

	function clearAll() {
		if (!confirm('Clear ALL data (localStorage + IndexedDB)? Page will reload.')) return
		resetLocalData()
		location.reload()
	}
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>
	<h1>App State</h1>

	<section>
		<menu>
			<button onclick={clearAll}>Clear all data</button>
		</menu>
	</section>

	<section>
		<h2>Reactivity test</h2>
		<button onclick={toggleQueuePanel}>Toggle queue</button>
		<p>Queue visible: {appState.queue_panel_visible}</p>
		<InputRange bind:value={appState.volume} min={0} max={1} step={0.1} />
		<p>Volume: {appState.volume}</p>
	</section>
</div>

<style>
	h2 {
		margin-block-start: 2rem;
	}
</style>
