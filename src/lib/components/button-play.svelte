<script>
	import {playChannel, togglePlayPause} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, class?: string, label?: string, trackId?: string}} */
	let {channel, label = '', trackId, ...rest} = $props()

	let loading = $state(false)

	let activeDeck = $derived(appState.decks[appState.active_deck_id])
	let isChannelLoaded = $derived(activeDeck?.playlist_slug === channel.slug)
	let isPlaying = $derived(isChannelLoaded && activeDeck?.is_playing)

	async function play(event) {
		event.preventDefault()
		if (isChannelLoaded) {
			togglePlayPause(appState.active_deck_id)
			return
		}
		loading = true
		await playChannel(appState.active_deck_id, channel, trackId)
		loading = false
	}
</script>

<button
	data-loading={loading}
	disabled={loading}
	class:active={isPlaying}
	onclick={play}
	title={isPlaying ? `Pause ${channel.name}` : isChannelLoaded ? `Resume ${channel.name}` : `Play ${channel.name}`}
	{...rest}
>
	<Icon icon={isPlaying ? 'pause' : 'play-fill'} />
	{label}
</button>
