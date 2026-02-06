<script>
	import {untrack} from 'svelte'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {Debounced} from 'runed'
	import SearchInput from '$lib/components/search-input.svelte'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	// Local input state - not derived, so typing doesn't get overwritten
	let inputValue = $state('')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// Sync input with URL param when URL changes externally (e.g. back/forward navigation)
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || ''
		const currentInput = untrack(() => inputValue)
		// Only sync if content differs (URL stores trimmed value, so compare trimmed)
		if (urlSearch !== currentInput.trim()) {
			inputValue = urlSearch
		}
	})

	// Navigate when debounced input changes
	$effect(() => {
		const search = debouncedInput.current.trim()
		const urlSearch = untrack(() => page.url.searchParams.get('search') || '')
		if (search === urlSearch) return
		const params = new SvelteURLSearchParams(untrack(() => page.url.searchParams))
		if (search) {
			params.set('search', search)
			goto(`/search?${params}`)
		} else {
			params.delete('search')
			goto('/')
		}
	})

	function handleSubmit(event) {
		event.preventDefault()
		if (inputValue.trim()) {
			debouncedInput.setImmediately(inputValue)
		}
	}

	function handleKeydown(event) {
		if (event.key === 'Escape' && !inputValue.trim()) {
			goto('/')
		}
	}
</script>

<form class="form" onsubmit={handleSubmit}>
	<fieldset>
		<label for="{uid}-search" class="visually-hidden">{m.header_search_placeholder()}</label>
		<SearchInput
			id="{uid}-search"
			bind:value={inputValue}
			placeholder={m.header_search_placeholder()}
			onkeydown={handleKeydown}
		/>
	</fieldset>
</form>

<style>
	fieldset {
		flex-flow: row;
	}

	@media (max-width: 500px) {
		:global(input[type='search']) {
			width: 10ch;
		}
	}
</style>
