<script>
	let {children} = $props()
</script>

<dl class="meta-list">
	{@render children?.()}
</dl>

<style>
	.meta-list {
		display: grid;
		grid-template-columns: minmax(9rem, max-content) minmax(0, 1fr);
		gap: 0.25rem 0.5rem;
		align-items: baseline;
		margin: 0;
	}

	.meta-list :global(dt) {
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}

	.meta-list :global(dd) {
		margin: 0;
		min-width: 0;
	}
</style>
