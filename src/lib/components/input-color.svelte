<script>
	import ColorPicker from 'svelte-awesome-color-picker'

	/** @type {{label?: string, value?: string, oninput?: (e: {target: {value: string}}) => void, onchange?: (e: {target: {value: string}}) => void, disabled?: boolean}} */
	let {label, value = $bindable('#000000'), oninput, onchange, disabled} = $props()

	const handleInput = (event) => {
		value = event.hex
		oninput?.({target: {value: event.hex}})
		onchange?.({target: {value: event.hex}})
	}
</script>

<ColorPicker {label} bind:hex={value} onInput={handleInput} isDialog={true} />

<style>
	:root {
		--picker-z-index: 3;
		/*
		--cp-bg-color: var(--bg);
		--cp-text-color: var(--text);
		--cp-button-hover-color: var(--gray-3);
		 */
		--cp-input-color: white;
		--cp-border-color: var(--gray-7);
	}

	:global(html.dark) {
		--cp-bg-color: var(--gray-4);
		--cp-border-color: var(--gray-12);
		--cp-text-color: var(--gray-1);
		--cp-input-color: var(--gray-7);
		--cp-button-hover-color: var(--gray-6);
	}

	:global(.color-picker.vertical > label) {
		margin-left: 0;
		color: initial;
	}

	:global(.color-picker .wrapper) {
		background: var(--gray-3);
		box-shadow:
			lch(0 0 0 / 0.188) 0px 3px 12px,
			lch(0 0 0 / 0.188) 0px 2px 8px,
			lch(0 0 0 / 0.188) 0px 1px 1px;
		border: 1px solid var(--gray-8);
		border-radius: var(--border-radius);
		padding: 0.5rem;
	}
</style>
