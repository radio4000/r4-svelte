<script>
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'

	const appState = $derived(useAppState().data)

	function inc() {
		appStateCollection.update(1, (draft) => {
			draft.counter++
		})
	}
</script>

<button onclick={inc}> R{appState?.counter}</button>

<style>
	button {
		min-width: 2.7rem;
	}

	:global(a.active) button {
		border-color: var(--accent-9);
	}
</style>
