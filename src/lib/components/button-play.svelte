<script>
	import {playChannel, togglePlayPause} from '$lib/api'
	import {joinBroadcast} from '$lib/broadcast.js'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, class?: string, label?: string, trackId?: string, isBroadcasting?: boolean}} */
	let {channel, label = '', trackId, isBroadcasting = false, ...rest} = $props()

	let loading = $state(false)

	let activeDeck = $derived(appState.decks[appState.active_deck_id])
	let isChannelLoaded = $derived(activeDeck?.playlist_slug === channel.slug)
	let isListening = $derived(activeDeck?.listening_to_channel_id === channel.id)
	let isPlaying = $derived((isChannelLoaded || isListening) && activeDeck?.is_playing)

	async function play(event) {
		event.preventDefault()
		if (isChannelLoaded || isListening) {
			togglePlayPause(appState.active_deck_id)
			return
		}
		loading = true
		if (isBroadcasting) {
			await joinBroadcast(appState.active_deck_id, channel.id)
		} else {
			await playChannel(appState.active_deck_id, channel, trackId)
		}
		loading = false
	}
</script>

<button
	data-loading={loading}
	disabled={loading}
	class:active={isPlaying}
	onclick={play}
	title={isPlaying
		? `Pause ${channel.name}`
		: isListening
			? `Resume ${channel.name}`
			: isChannelLoaded
				? `Resume ${channel.name}`
				: isBroadcasting
					? `Join ${channel.name} live`
					: `Play ${channel.name}`}
	{...rest}
>
	<Icon icon={isPlaying ? 'pause' : isBroadcasting ? 'signal' : 'play-fill'} />
	{label}
</button>
