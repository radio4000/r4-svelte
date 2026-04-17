<script>
	import {page} from '$app/state'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchTabs from '$lib/components/search-tabs.svelte'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import * as m from '$lib/paraglide/messages'

	let {uid, value = $bindable(''), onsubmit, view = undefined, onviewchange = undefined} = $props()

	const placeholder = $derived.by(() => {
		if (page.route.id === '/search/channels')
			return `Search ${m.search_tab_channels().toLowerCase()}`
		if (page.route.id === '/search/tracks') return `Search ${m.search_tab_tracks().toLowerCase()}`
		return `Search ${m.search_tab_channels().toLowerCase()} & ${m.search_tab_tracks().toLowerCase()}`
	})
</script>

<header class="search-header">
	<form {onsubmit}>
		<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
		<SearchInput id="{uid}-search" bind:value {placeholder} autofocus />
	</form>
	<SearchTabs />
	{#if view && onviewchange}
		<ViewsBar {view} onchange={onviewchange} />
	{/if}
</header>

<style>
	.search-header {
		position: sticky;
		top: 0;
		background: linear-gradient(to bottom, var(--color-interface) 60%, transparent);
		z-index: 3;
		padding: 0.5rem;
		padding-bottom: 1.5rem;
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.search-header :global(.search-tabs),
	.search-header :global(.popover-menu),
	.search-header :global(.views-bar) {
		flex-shrink: 0;
	}

	.search-header form {
		flex: 1 1 100%;
		min-width: min(200px, 100%);
	}

	.search-header form :global(input) {
		width: 100%;
	}
</style>
