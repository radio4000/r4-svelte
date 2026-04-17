<script>
	import {Debounced} from 'runed'
	import Icon from '$lib/components/icon.svelte'
	import {afterNavigate} from '$app/navigation'
	import * as m from '$lib/paraglide/messages'

	/* A normal input, but with a search icon "inside" (on top) */
	let {
		value = $bindable(''),
		placeholder: placeholderText = 'Search...',
		debounce = 0,
		...restProps
	} = $props()

	let inputValue = $state(value)
	let lastExternalValue = value

	// Only sync when value changes externally (e.g. programmatic clear)
	$effect(() => {
		if (value !== lastExternalValue) {
			lastExternalValue = value
			inputValue = value
		}
	})

	// svelte-ignore state_referenced_locally
	const debounced = new Debounced(() => inputValue, debounce)

	// Emit debounced value to parent
	$effect(() => {
		const v = debounced.current
		if (v !== value) {
			value = v
			lastExternalValue = v
		}
	})

	afterNavigate(() => {
		// workaround for autofocus attr not always being enough
		if (restProps.autofocus) {
			/** @type {HTMLElement | null} */
			const to_focus = document.querySelector('input[type="search"]')
			to_focus?.focus()
		}
	})

	function clear() {
		inputValue = ''
		value = ''
		lastExternalValue = ''
	}
</script>

<div class="search-input">
	<Icon icon="search" />
	<input type="search" placeholder={placeholderText} bind:value={inputValue} {...restProps} />
	{#if inputValue}
		<button class="clear" title={m.common_clear()} onclick={clear} type="button">
			<Icon icon="close" />
		</button>
	{/if}
</div>

<style>
	div {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	div > :global(.icon) {
		position: absolute;
		left: 0.35rem;
		z-index: 1;
		opacity: 0.5;
	}

	input[type='search'] {
		flex: 1;
		min-width: 0;
		padding-left: 1.5rem;
		padding-right: 1.5rem;

		/* hide browser default clear button */
		&::-webkit-search-cancel-button {
			display: none;
		}
	}

	.clear {
		position: absolute;
		right: 0.25rem;
		display: flex;
		align-items: center;
		padding: 0.15rem;
		background: none;
		border: none;
		cursor: var(--interactive-cursor, pointer);
		opacity: 0.5;
		color: inherit;

		&:hover {
			opacity: 1;
		}
	}
</style>
