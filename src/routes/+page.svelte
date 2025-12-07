<script>
	import {onMount, getContext} from 'svelte'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const slug = $derived(page?.url?.searchParams?.get('slug'))
	const display = $derived(page?.url?.searchParams?.get('display'))
	const longitude = $derived(Number(page?.url?.searchParams?.get('longitude')))
	const latitude = $derived(Number(page?.url?.searchParams?.get('latitude')))
	const zoom = $derived(page?.url?.searchParams?.get('zoom') ? Number(page?.url?.searchParams?.get('zoom')) : 4)

	const getChannels = getContext('channels')
	const channels = $derived(getChannels())

	onMount(() => {
		if (display && display !== appState.channels_display) {
			appState.channels_display = display
		}
	})
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

<Channels {channels} {slug} {display} {longitude} {latitude} {zoom} />
