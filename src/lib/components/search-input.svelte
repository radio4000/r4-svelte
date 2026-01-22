<script>
	import Icon from '$lib/components/icon.svelte'
	import {afterNavigate} from '$app/navigation'

	/* A normal input, but with a search icon "inside" (on top) */
	let {value = $bindable(''), placeholder = 'Search...', ...restProps} = $props()

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
	<input type="search" {placeholder} bind:value {...restProps} />
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
