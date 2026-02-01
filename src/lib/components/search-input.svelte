<script>
	import Icon from '$lib/components/icon.svelte'
	import {afterNavigate} from '$app/navigation'

	/* A normal input, but with a search icon "inside" (on top) */
	let {value = $bindable(''), placeholder = 'Search...', debounce = 0, ...restProps} = $props()

	let inputValue = $state(value)
	let timer
	let lastExternalValue = value

	// Only sync when value changes externally (e.g. programmatic clear)
	$effect(() => {
		if (value !== lastExternalValue) {
			lastExternalValue = value
			inputValue = value
		}
	})

	function handleInput(e) {
		inputValue = e.target.value
		if (debounce > 0) {
			clearTimeout(timer)
			timer = setTimeout(() => {
				value = inputValue
				lastExternalValue = inputValue
			}, debounce)
		} else {
			value = inputValue
			lastExternalValue = inputValue
		}
	}

	afterNavigate(() => {
		// workaround for autofocus attr not always being enough
		if (restProps.autofocus) {
			/** @type {HTMLElement | null} */
			const to_focus = document.querySelector('input[type="search"]')
			to_focus?.focus()
		}
	})
</script>

<div>
	<Icon icon="search" size={16} />
	<input type="search" {placeholder} bind:value={inputValue} oninput={handleInput} {...restProps} />
</div>

<style>
	div {
		position: relative;
		display: flex;
		align-items: center;
	}

	div > :global(.icon) {
		position: absolute;
		left: 0.35rem;
		z-index: 1;
		opacity: 0.5;
	}

	input[type='search'] {
		padding-left: 1.5rem;
	}
</style>
