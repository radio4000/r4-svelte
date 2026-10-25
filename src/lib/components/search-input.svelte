<script>
	import {Debounced} from 'runed'
	import Icon from '#lib/components/icon.svelte'
	import {afterNavigate} from '$app/navigation'
	import {onMount, untrack} from 'svelte'
	import * as m from '#lib/paraglide/messages.js'

	/* A normal input, but with a search icon "inside" (on top) */
	let {
		value = $bindable(''),
		placeholder: placeholderText = 'Search...',
		debounce = 0,
		...restProps
	} = $props()

	let inputValue = $state(value)
	let lastExternalValue = value
	let input

	// Only sync when value changes externally (e.g. programmatic clear)
	$effect(() => {
		if (value !== lastExternalValue) {
			lastExternalValue = value
			inputValue = value
		}
	})

	// svelte-ignore state_referenced_locally
	const debounced = new Debounced(() => inputValue, debounce)

	// Emit debounced value to parent. Only when it changes: re-running on an external
	// change would send back the stale debounced value (a ?q= link briefly dropped ?q=).
	$effect(() => {
		const v = debounced.current
		untrack(() => {
			if (v !== value) {
				value = v
				lastExternalValue = v
			}
		})
	})

	function focusInput() {
		if (restProps.autofocus) input?.focus({preventScroll: true})
	}

	onMount(focusInput)
	afterNavigate((nav) => !nav.shallow && focusInput())

	function clear() {
		inputValue = ''
		value = ''
		lastExternalValue = ''
	}
</script>

<div class="search-input">
	<Icon icon="search" />
	<input
		bind:this={input}
		type="search"
		placeholder={placeholderText}
		bind:value={inputValue}
		{...restProps}
	/>
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
		left: var(--space-2);
		z-index: 1;
		opacity: 0.5;
	}

	input[type='search'] {
		flex: 1;
		min-width: 0;
		padding-left: 1.8rem;
		padding-right: 1.5rem;

		/* hide browser default clear button */
		&::-webkit-search-cancel-button {
			display: none;
		}
	}

	.clear {
		position: absolute;
		right: var(--space-1);
		display: flex;
		align-items: center;
		padding: var(--space-1);
		background: none;
		border: none;
		cursor: var(--interactive-cursor, pointer);
		opacity: 0.5;
		color: inherit;

		@media (hover: hover) and (pointer: fine) {
			&:hover {
				opacity: 1;
			}
		}
	}
</style>
