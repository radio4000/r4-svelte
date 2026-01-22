<script>
	import MixBuilder from '$lib/components/mix-builder.svelte'

	/** @type {import('$lib/components/mix-builder.svelte').Source[]} */
	let sources = $state([])
	let options = $state({shuffle: false, withoutErrors: false, limit: 50})

	/** @type {import('./$types').Snapshot<{sources: typeof sources, options: typeof options}>} */
	export const snapshot = {
		capture: () => ({sources, options}),
		restore: (v) => {
			sources = v.sources
			options = v.options
		}
	}
</script>

<svelte:head>
	<title>Mix</title>
</svelte:head>

<article class="constrained">
	<header>
		<h1>Mix</h1>
		<p>Build a playlist from multiple sources</p>
	</header>

	<MixBuilder bind:sources bind:options />
</article>

<style>
	header {
		margin-bottom: 1rem;
	}

	h1 {
		margin: 0;
	}

	p {
		color: var(--gray-10);
		margin: 0.25rem 0 0;
	}
</style>
