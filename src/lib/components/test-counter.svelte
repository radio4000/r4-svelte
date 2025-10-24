<script>
	import {useAppState} from '$lib/app-state.svelte'

	const appState = useAppState()

	function inc() {
		appState.counter++
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
