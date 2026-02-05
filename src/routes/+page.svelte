<script>
	import {onMount} from 'svelte'
	import {getChannelsCtx} from '$lib/contexts'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const display = $derived(page?.url?.searchParams?.get('display'))

	const getChannels = getChannelsCtx()
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

<Channels {channels} {display} />
