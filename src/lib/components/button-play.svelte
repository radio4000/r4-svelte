<script>
	import {playChannel} from '$lib/api'
	import Icon from '$lib/components/icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, class?: string, label?: string}} */
	let {channel, label = '', ...rest} = $props()

	let loading = $state(false)

	async function play(event) {
		event.preventDefault()
		loading = true
		await playChannel(channel)
		loading = false
	}
</script>

<button data-loading={loading} disabled={loading} onclick={play} title={`Play ${channel.name}`} {...rest}>
	<Icon icon="play-fill" size={20} />
	{label}
</button>
