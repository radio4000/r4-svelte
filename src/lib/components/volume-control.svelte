<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {getMediaPlayer} from '#lib/api.js'
	import {getBroadcastingChannelId, notifyBroadcastState} from '#lib/broadcast.js'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'
	import 'media-chrome'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])

	function handleToggleMute() {
		if (!deck) return
		const mediaElement = getMediaPlayer(deckId)
		if (!mediaElement) return
		const nextMuted = !mediaElement.muted
		mediaElement.muted = nextMuted
		deck.muted = nextMuted
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}
</script>

<div class="volume">
	<media-mute-button
		class="btn"
		class:active={Boolean(deck?.muted)}
		mediavolumelevel={deck?.muted ? 'off' : 'high'}
		onclick={handleToggleMute}
		{@attach tooltip({content: m.player_tooltip_mute(), position: 'top'})}
	></media-mute-button>
	<input
		type="range"
		min="0"
		max="1"
		step="0.01"
		value={deck?.volume ?? 1}
		style="--range-fill: {((deck?.volume ?? 1) * 100).toFixed(1)}%"
		oninput={(e) => {
			const val = Number(e.currentTarget.value)
			if (deck) deck.volume = val
			const mediaElement = getMediaPlayer(deckId)
			if (mediaElement) {
				mediaElement.volume = val
				// Unmute if volume is raised and the mute was only technical (not user-explicit)
				if (val > 0 && mediaElement.muted && !deck?.muted) {
					mediaElement.muted = false
				}
			}
			const broadcastingChannelId = getBroadcastingChannelId()
			if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
		}}
		class="range"
		data-muted={deck?.muted || deck?.volume === 0 || null}
	/>
</div>

<style>
	.volume {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: 1 1 6rem;
		min-width: 0;
	}

	.range {
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
	}

	.range[data-muted] {
		--range-color: var(--gray-7);
		accent-color: var(--gray-7);
	}

	.volume :global(media-mute-button) {
		--media-control-background: var(--button-bg);
		--media-control-hover-background: var(--button-bg);
		--media-icon-color: currentColor;
		--media-icon-color-hover: currentColor;
		color: var(--button-color);
	}

	.volume :global(media-mute-button.active) {
		color: var(--accent-9);
		border-color: color-mix(
			in oklch,
			var(--accent-9) calc(var(--border-opacity) * 100%),
			transparent
		);
		background-color: var(--accent-3);
	}
</style>
