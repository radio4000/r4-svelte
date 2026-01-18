<script>
	let {data} = $props()
</script>

<svelte:head>
	<title>{data.slug} - r5 docs</title>
</svelte:head>

<menu data-grouped>
	<a href="/docs">index</a>
	<a href="/docs/overview">overview</a>
	{#each data.docs.filter((d) => d !== 'index' && d !== 'overview') as doc (doc)}
		<a href="/docs/{doc}">{doc}</a>
	{/each}
</menu>

<!-- eslint-disable svelte/no-at-html-tags -->
<article>
	{@html data.html}
</article>

<style>
	article {
		margin: 0.5rem 0.5rem 10rem;
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
