<script>
	import MixBuilder from '$lib/components/mix-builder.svelte'
	import DjMixer from '$lib/components/dj-mixer.svelte'

	/** @type {import('$lib/components/mix-builder.svelte').Source[]} */
	let sources = $state([])
	let options = $state({shuffle: false, withoutErrors: false, limit: 50})

	let mode = $state('dj')

	/** @type {import('./$types').Snapshot<{sources: typeof sources, options: typeof options, mode: typeof mode}>} */
	export const snapshot = {
		capture: () => ({sources, options, mode}),
		restore: (v) => {
			sources = v.sources
			options = v.options
			mode = v.mode
		}
	}
</script>

<svelte:head>
	<title>Mix</title>
</svelte:head>

<article class="constrained">
	<header>
		<h1>Mix</h1>
		<nav>
			<button type="button" class:active={mode === 'dj'} onclick={() => (mode = 'dj')}>DJ</button>
			<button type="button" class:active={mode === 'build'} onclick={() => (mode = 'build')}>Build</button>
		</nav>
	</header>

	{#if mode === 'dj'}
		<DjMixer />
	{:else}
		<MixBuilder bind:sources bind:options />
	{/if}
</article>

<style>
	header {
		margin-bottom: 1rem;
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}

	h1 {
		margin: 0;
	}

	nav {
		display: flex;
		gap: 0.25rem;
	}

	nav button {
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
	}
</style>
