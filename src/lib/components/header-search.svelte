<script>
	import {untrack} from 'svelte'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import SearchInput from '$lib/components/search-input.svelte'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	let debounceTimer = $state()

	// Local input state - not derived, so typing doesn't get overwritten
	let inputValue = $state('')

	// Sync input with URL param when URL changes externally (e.g. back/forward navigation)
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || ''
		const currentInput = untrack(() => inputValue)
		// Only sync if content differs (URL stores trimmed value, so compare trimmed)
		if (urlSearch !== currentInput.trim()) {
			inputValue = urlSearch
		}
	})

	function debouncedSearch(value) {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			const params = new SvelteURLSearchParams(page.url.searchParams)
			if (value.trim()) {
				params.set('search', value.trim())
				goto(`/search?${params}`)
			} else {
				params.delete('search')
				goto('/')
			}
		}, 300)
	}

	function handleSubmit(event) {
		event.preventDefault()
		clearTimeout(debounceTimer)
		const params = new SvelteURLSearchParams(page.url.searchParams)
		if (inputValue.trim()) {
			params.set('search', inputValue.trim())
			goto(`/search?${params}`)
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
			oninput={(e) => debouncedSearch(e.target.value)}
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
