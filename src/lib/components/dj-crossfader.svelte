<script>
	/** @type {{value?: number}} */
	let {value = $bindable(0)} = $props()
</script>

<div class="crossfader">
	<span class="label">A</span>
	<input type="range" bind:value min={-1} max={1} step={0.05} />
	<span class="label">B</span>
</div>

<style>
	.crossfader {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.label {
		font-weight: 600;
		font-size: var(--font-2);
		color: var(--gray-10);
		min-width: 1ch;
	}

	input[type='range'] {
		flex: 1;
		margin: 0;
		accent-color: var(--gray-9);
	}
</style>
