<script>
	const {wrap = false} = $props()
</script>

<menu class="page-header" class:page-header--wrap={wrap}>
	<slot />
</menu>

<style>
	.page-header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		margin-inline: -0.5rem;
		padding-inline: 0.5rem;
		padding-block: 0.25rem;
		z-index: 1;
		background: var(--color-interface);
	}

	.page-header--wrap {
		flex-wrap: wrap;
	}

	.page-header :global(.search-input) {
		flex: 1 1 0;
		min-width: 6rem;
	}
</style>
