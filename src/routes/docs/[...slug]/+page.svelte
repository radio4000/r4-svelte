<script>
	let {data} = $props()
</script>

<svelte:head>
	<title>{data.slug} - r5 docs</title>
</svelte:head>

<!-- eslint-disable svelte/no-at-html-tags -->
<article>
	{@html data.html}
</article>

<style>
	article {
		margin-block-end: 10rem;
		:global(h1) {
			margin-block-start: 0.75rem;
			text-transform: uppercase;
		}
		:global(h2) {
			margin-block-start: 1rem;
		}
		:global(p, ul, ol) {
			margin-block-start: 0.75rem;
			margin-block-end: 0.75rem;
		}
		:global(code) {
			font-size: var(--font-3);
		}
	}
</style>
