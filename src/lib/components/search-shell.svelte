<script>
	import {page} from '$app/state'
	import SearchInput from '#lib/components/search-input.svelte'
	import SearchTabs from '#lib/components/search-tabs.svelte'
	import ViewsBar from '#lib/components/views-bar.svelte'
	import PageHeader from '#lib/components/page-header.svelte'
	import * as m from '#lib/paraglide/messages.js'

	let {
		uid,
		value = $bindable(''),
		onsubmit,
		view = undefined,
		onviewchange = undefined,
		pagination = undefined,
		filterToggle = undefined
	} = $props()

	const placeholder = $derived.by(() => {
		if (page.route.id === '/search/channels')
			return `Search ${m.search_tab_channels().toLowerCase()}`
		if (page.route.id === '/search/tracks') return `Search ${m.search_tab_tracks().toLowerCase()}`
		return `Search ${m.search_tab_channels().toLowerCase()} & ${m.search_tab_tracks().toLowerCase()}`
	})
</script>

<PageHeader wrap>
	<form class="search-form" {onsubmit}>
		<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
		<SearchInput id="{uid}-search" bind:value {placeholder} autofocus />
	</form>
	<nav class="search-nav-row">
		<SearchTabs />
		<div class="search-nav-controls">
			{#if pagination}{@render pagination()}{/if}
			{#if filterToggle}{@render filterToggle()}{/if}
			{#if view && onviewchange}
				<ViewsBar {view} onchange={onviewchange} />
			{/if}
		</div>
	</nav>
</PageHeader>

<style>
	.search-form {
		flex: 1 1 100%;
		min-width: min(200px, 100%);
	}

	.search-form :global(input) {
		width: 100%;
	}

	.search-nav-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-x: contain;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scroll-snap-type: x proximity;
		gap: var(--space-2);
		width: 100%;
	}

	.search-nav-row :global(.search-tabs),
	.search-nav-controls {
		flex-shrink: 0;
		scroll-snap-align: start;
	}

	.search-nav-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
