<script>
	import {onMount} from 'svelte'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const display = $derived(page?.url?.searchParams?.get('display'))

	const validDisplays = /** @type {const} */ (['grid', 'list', 'map', 'infinite', 'tuner'])
	onMount(() => {
		if (display && validDisplays.includes(/** @type {any} */ (display)) && display !== appState.channels_display) {
			appState.channels_display = /** @type {typeof validDisplays[number]} */ (display)
		}
	})
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

<Channels {display} />
