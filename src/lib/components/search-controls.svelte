<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

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

<form class="form" onsubmit={handleSubmit}>
	<fieldset>
		<label for="{uid}-search"><Icon icon="search" /></label>
		<input
			id="{uid}-search"
			type="search"
			placeholder={m.search_tracks_placeholder()}
			bind:value={searchValue}
			onblur={handleSearchBlur}
		/>
	</fieldset>
</form>

<style>
	fieldset {
		flex: 1;
		flex-flow: row;
	}

	input[type='search'] {
		flex: 1;
	}
</style>
