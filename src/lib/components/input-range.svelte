<script>
	/** @type {{value?: number, min?: number, max?: number, step?: number, visualStep?: number, oninput?: (e: Event) => void, [key: string]: any}} */
	let {value = $bindable(0), min = 0, max = 100, step = 4, visualStep, oninput, ...props} = $props()

	let marks = $derived(Math.floor((max - min) / (visualStep ?? step)) + 1)
</script>

<div class="input-range">
	<input type="range" {min} {max} {step} bind:value {oninput} {...props} />
	<div class="marks" aria-hidden="true">
		{#each {length: marks}, i (i)}
			<div class="mark"></div>
		{/each}
	</div>
</div>

<style>
	.input-range {
		position: relative;
		display: flex;
		height: 20px;
		align-items: center;
	}

	input[type='range'] {
		flex: 1;
		margin: 0;
		background: transparent;
		cursor: pointer;
		position: relative;
		z-index: 2;
		accent-color: var(--gray-9);
	}

	.marks {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 8px;
		right: 8px;
		pointer-events: none;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.mark {
		width: 1px;
		height: 4px;
		background: var(--gray-6);
		border-radius: 1px;
	}
</style>
