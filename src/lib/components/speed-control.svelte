<script>
	import {appState} from '$lib/app-state.svelte'
	import {getMediaPlayer} from '$lib/api'
	import {getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'

	/** @type {{deckId: number, provider: string | null}} */
	let {deckId, provider} = $props()

	let deck = $derived(appState.decks[deckId])
	let useNativeAudio = $derived(provider === 'file')
	let supportsPlaybackSpeed = $derived(provider !== 'soundcloud' && Boolean(deck))
	let speedMin = $derived(useNativeAudio ? 0.25 : 0.25)
	let speedMax = $derived(useNativeAudio ? 3 : 2)
	let speedStep = $derived(useNativeAudio ? 0.01 : 0.25)

	function handleSpeedChange(speed) {
		if (!deck) return
		deck.speed = speed
		const mediaElement = getMediaPlayer(deckId)
		if (mediaElement && 'playbackRate' in mediaElement) mediaElement.playbackRate = speed
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}
</script>

{#if appState.show_speed_control && supportsPlaybackSpeed}
	<div class="speed">
		<button
			class="speed-btn"
			class:active={deck?.speed != null && deck.speed !== 1}
			onclick={() => handleSpeedChange(1)}
			{@attach tooltip({content: 'Reset speed', position: 'top'})}
		>
			{Number(deck?.speed ?? 1).toFixed(2)}x
		</button>
		<input
			type="range"
			min={speedMin}
			max={speedMax}
			step={speedStep}
			value={deck?.speed ?? 1}
			oninput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
			class="range"
			data-default={!deck?.speed || deck.speed === 1 || null}
		/>
	</div>
{/if}

<style>
	.speed {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 1;
		min-width: 0;
	}

	.speed-btn {
		font-size: var(--font-1);
		min-width: 2.5em;
		text-align: center;
		flex-shrink: 0;
	}

	.range {
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
		cursor: pointer;
	}

	.range[data-default] {
		accent-color: var(--gray-7);
	}
</style>
