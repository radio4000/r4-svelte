<script>
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {toggleQueuePanel, toggleTheme} from '$lib/api'
	import SearchInput from '$lib/components/search-input.svelte'
	import {channelsCollection} from '$lib/collections'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'

	let debounceTimer = $state()

	// Get all channels from collection
	const {data: allChannels} = useLiveQuery((q) => q.from({channel: channelsCollection}))

	// Reactive URL params - recreate when page URL changes
	let params = $derived(new SvelteURLSearchParams(page.url.searchParams))
	let searchQuery = $derived(params.get('search') || '')

	// Filtered channels for @mention autocomplete
	let filteredChannels = $derived.by(() => {
		if (!allChannels || !allChannels.length) return []
		if (!searchQuery.includes('@')) return allChannels.slice(0, 5)
		const mentionQuery = searchQuery.slice(searchQuery.lastIndexOf('@') + 1)
		if (mentionQuery.length < 1) return allChannels.slice(0, 5)
		return allChannels
			.filter(
				(c) => c.slug.includes(mentionQuery.toLowerCase()) || c.name.toLowerCase().includes(mentionQuery.toLowerCase())
			)
			.slice(0, 5)
	})

	const commands = $derived.by(() => {
		return [
			{id: 'settings', title: 'Go to Settings', type: 'link', target: '/settings'},
			{id: 'toggle-theme', title: 'Toggle theme', type: 'command', action: toggleTheme},
			{id: 'toggle-queue', title: 'Toggle queue panel', type: 'command', action: toggleQueuePanel}
		]
	})

	function debouncedSearch(value) {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
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
		if (searchQuery.trim()) {
			params.set('search', searchQuery.trim())
			goto(`/search?${params}`)
		}
	}

	function handleKeydown(event) {
		if (event.key === 'Escape' && !searchQuery.trim()) {
			goto('/')
		}
		console.log(event.key, searchQuery)
	}
</script>

<form onsubmit={handleSubmit}>
	<SearchInput
		value={searchQuery}
		placeholder="Search radios & tracks"
		oninput={(e) => debouncedSearch(e.target.value)}
		onkeydown={handleKeydown}
		DISABLEDlist="command-suggestions"
	/>
	<datalist id="command-suggestions">
		{#each commands as command (command.id)}
			<option value="/{command.id}">/{command.title}</option>
		{/each}
		{#each filteredChannels as channel (channel.id)}
			<option value="@{channel.slug}">@{channel.slug} - {channel.name}</option>
		{/each}
	</datalist>
</form>

<style>
	:global(input[type='search']) {
		min-width: 24ch;
	}
</style>
