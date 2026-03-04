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

