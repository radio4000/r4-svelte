<script>
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let isOnline = $state(navigator.onLine)

	function inc() {
		appState.counter++
	}

	$effect(() => {
		function onOnline() {
			isOnline = true
		}
		function onOffline() {
			isOnline = false
		}
		window.addEventListener('online', onOnline)
		window.addEventListener('offline', onOffline)
		return () => {
			window.removeEventListener('online', onOnline)
			window.removeEventListener('offline', onOffline)
		}
	})
</script>

<button onclick={inc} class:offline={!isOnline}>
	{#if !isOnline}
		OFF<br />LINE
	{:else}
		{m.test_counter_prefix()}{appState.counter}
	{/if}
</button>

<style>
	button {
		/* avoids ui jumps */
		min-width: 2.8rem;
	}

	:global(a.active) button {
		border-color: var(--accent-9);
	}

	button.offline {
		font-size: var(--font-1);
		line-height: 1.2;
		color: var(--gray-9);
		background: var(--gray-3);
	}
</style>
