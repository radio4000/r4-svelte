<script>
	import {playChannel} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, class?: string, label?: string, trackId?: string}} */
	let {channel, label = '', trackId, ...rest} = $props()

	let loading = $state(false)

	async function play(event) {
		event.preventDefault()
		loading = true
		await playChannel(appState.active_deck_id, channel, trackId)
		loading = false
	}
</script>

<button data-loading={loading} disabled={loading} onclick={play} title={`Play ${channel.name}`} {...rest}>
	<Icon icon="play-fill" />
	{label}
</button>
