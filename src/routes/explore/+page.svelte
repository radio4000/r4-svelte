<script>
	import {page} from '$app/state'
	import {afterNavigate} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const display = $derived(page?.url?.searchParams?.get('display'))

	const validDisplays = /** @type {const} */ (['grid', 'list', 'map', 'infinite', 'tuner'])
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

	afterNavigate(({from}) => {
		if (display && validDisplays.includes(/** @type {any} */ (display)) && display !== appState.channels_display) {
			appState.channels_display = /** @type {typeof validDisplays[number]} */ (display)
		}
		const toFilter = page?.url?.searchParams?.get('filter')
		const fromFilter = from?.url?.searchParams?.get('filter')
		if (toFilter && validFilters.includes(/** @type {any} */ (toFilter)) && toFilter !== fromFilter) {
			appState.channels_filter = /** @type {typeof validFilters[number]} */ (toFilter)
		}
	})
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<Channels {display} defaultFilter="featured" />
