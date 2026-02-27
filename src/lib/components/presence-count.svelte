<script>
	/** @type {{ count: number }} */
	let {count} = $props()
</script>

{#if count > 0}
	<span class="presence-count" title="{count} listener{count === 1 ? '' : 's'}">
		<span class="icon" aria-hidden="true">◉</span>
		<span>{count}</span>
	</span>
{/if}

<style>
	.presence-count {
		display: inline-flex;
		align-items: center;
		gap: 0.2em;
		font-size: var(--font-1);
		color: var(--gray-11);
	}

	.icon {
		font-size: 0.6em;
		color: var(--accent-9);
	}
</style>
