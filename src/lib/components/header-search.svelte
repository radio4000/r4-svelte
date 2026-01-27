<script>
	import {untrack} from 'svelte'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {toggleQueuePanel, toggleTheme} from '$lib/api'
	import SearchInput from '$lib/components/search-input.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
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

	// All channels from collection
	let allChannels = $derived([...channelsCollection.state.values()])

	// Filtered channels for @mention autocomplete
	let filteredChannels = $derived.by(() => {
		if (!inputValue.includes('@')) return allChannels.slice(0, 5)
		const mentionQuery = inputValue.slice(inputValue.lastIndexOf('@') + 1)
		if (mentionQuery.length < 1) return allChannels.slice(0, 5)
		return allChannels
			.filter(
				(c) =>
					c.slug?.includes(mentionQuery.toLowerCase()) || c.name?.toLowerCase().includes(mentionQuery.toLowerCase())
			)
			.slice(0, 5)
	})

	const commands = $derived.by(() => [
		{id: 'settings', type: 'link', target: '/settings'},
		{id: 'toggle-theme', type: 'command', action: toggleTheme},
		{id: 'toggle-queue', type: 'command', action: toggleQueuePanel}
	])

	function getCommandTitle(id) {
		if (id === 'settings') return m.command_go_settings()
		if (id === 'toggle-theme') return m.command_toggle_theme()
		if (id === 'toggle-queue') return m.command_toggle_queue()
		return id
	}

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
			DISABLEDlist="command-suggestions"
		/>
	</fieldset>
	<datalist id="command-suggestions">
		{#each commands as command (command.id)}
			<option value="/{command.id}">/{getCommandTitle(command.id)}</option>
		{/each}
		{#each filteredChannels as channel (channel.id)}
			<option value="@{channel.slug}">@{channel.slug} - {channel.name}</option>
		{/each}
	</datalist>
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
