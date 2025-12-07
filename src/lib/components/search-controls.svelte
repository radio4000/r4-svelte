<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {search = '', order = 'created', dir = 'desc', onSearchChange} = $props()

	let searchValue = $derived(search)

	function handleSubmit(event) {
		event.preventDefault()
		performSearch()
	}

	function handleSearchBlur() {
		performSearch()
	}

	function performSearch() {
		onSearchChange(searchValue)
		updateURL()
	}

	function updateURL() {
		const params = new URL(page.url).searchParams
		params.delete('search')
		params.delete('order')
		params.delete('dir')
		if (searchValue) params.set('search', searchValue)
		if (order !== 'created') params.set('order', order)
		if (dir !== 'desc') params.set('dir', dir)

		const queryString = params.toString()
		const newUrl = `${page.url.pathname}${queryString ? `?${queryString}` : ''}`
		goto(newUrl, {replaceState: true})
	}
</script>

<form onsubmit={handleSubmit}>
	<Icon icon="search" />
	<input type="search" placeholder={m.search_tracks_placeholder()} bind:value={searchValue} onblur={handleSearchBlur} />
	<!--<button type="button" onclick={clearSearch}>Search</button>-->

	<!--<label>
		<Icon icon="sort" />
		<select bind:value={sortField}>
			<option value="created">Created</option>
			<option value="updated">Updated</option>
			<option value="title">Title</option>
		</select>
	</label>
	<button type="button" onclick={toggleSortDirection}>
		{#if sortDirection === 'asc'}
			<Icon icon="funnel-ascending" />
		{:else}
			<Icon icon="funnel-descending" />
		{/if}
	</button>-->
</form>

<style>
	form {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	input[type='search'] {
		margin-left: -0.5rem;
		flex: 1;
	}
</style>
