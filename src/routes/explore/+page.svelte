<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const display = $derived(page?.url?.searchParams?.get('display'))

	const validFilters = /** @type {const} */ ([
		'all',
		'broadcasting',
		'imported',
		'10+',
		'100+',
		'1000+',
		'artwork',
		'featured'
	])

	// Sync URL → appState reactively (handles initial load + back/forward navigation)
	$effect(() => {
		const f = page.url.searchParams.get('filter')
		if (f && validFilters.includes(/** @type {any} */ (f))) {
			appState.channels_filter = /** @type {typeof validFilters[number]} */ (f)
		}
	})
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<Channels {display} defaultFilter="featured" />
