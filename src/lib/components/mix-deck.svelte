<script module>
	/**
	 * @typedef {{
	 *   id: number,
	 *   trackId: string | null,
	 *   trackUrl: string | null,
	 *   trackTitle: string | null,
	 *   volume: number,
	 *   speed: number,
	 *   playing: boolean
	 * }} DeckState
	 */
</script>

<script>
	import '$lib/youtube-video-custom-element.js'
	import {tracksCollection} from '$lib/tanstack/collections'
	import Icon from './icon.svelte'

	/** @type {{deck: DeckState, effectiveVolume?: number, queue?: string[]}} */
	let {deck = $bindable(), effectiveVolume = 1, queue = []} = $props()

	let queueIndex = $state(0)
	let prevQueueKey = ''

	$effect(() => {
		const key = queue.join(',')
		if (queue.length > 0 && key !== prevQueueKey) {
			prevQueueKey = key
			queueIndex = 0
			loadFromQueue(0)
		}
	})

	function loadFromQueue(index) {
		if (!queue.length || index < 0 || index >= queue.length) return
		const track = tracksCollection.get(queue[index])
		if (track) {
			deck.trackId = track.id
			deck.trackUrl = track.url || null
			deck.trackTitle = track.title || track.url || track.id
			deck.playing = false
		}
	}

	function prevTrack() {
		if (queueIndex > 0) loadFromQueue(--queueIndex)
	}

	function nextTrack() {
		if (queueIndex < queue.length - 1) loadFromQueue(++queueIndex)
	}

	/** @type {HTMLElement & {play: () => void, pause: () => void, volume: number, playbackRate: number} | null} */
	let player = $state(null)

	$effect(() => {
		if (player) player.volume = deck.volume * effectiveVolume
	})

	$effect(() => {
		if (player) player.playbackRate = deck.speed
	})

	function togglePlay() {
		if (!player || !deck.trackUrl) return
		if (deck.playing) player.pause()
		else player.play()
	}
</script>

<article data-deck={deck.id}>
	<div class="screen">
		{#if deck.trackUrl}
			<youtube-video
				bind:this={player}
				src={deck.trackUrl}
				onplay={() => (deck.playing = true)}
				onpause={() => (deck.playing = false)}
				onended={() => {
					deck.playing = false
					nextTrack()
				}}
			></youtube-video>
		{:else}
			<span class="empty">—</span>
		{/if}
	</div>

	<div class="display">
		<span class="led" data-active={deck.playing || undefined}></span>
		{#if deck.trackTitle}
			<span class="title">{deck.trackTitle}</span>
		{/if}
		{#if queue.length}
			<span class="counter">{queueIndex + 1}/{queue.length}</span>
		{/if}
	</div>

	<menu class="transport">
		<button type="button" onclick={prevTrack} disabled={!queue.length || queueIndex === 0}>
			<Icon icon="previous-fill" />
		</button>
		<button type="button" class="play" onclick={togglePlay} disabled={!deck.trackUrl}>
			<Icon icon={deck.playing ? 'pause' : 'play-fill'} />
		</button>
		<button type="button" onclick={nextTrack} disabled={!queue.length || queueIndex >= queue.length - 1}>
			<Icon icon="next-fill" />
		</button>
	</menu>

	<div class="controls">
		<label>
			<abbr title="Volume">V</abbr>
			<input type="range" bind:value={deck.volume} min={0} max={1} step={0.05} />
			<output>{Math.round(deck.volume * 100)}</output>
		</label>
		<label>
			<abbr title="Speed">S</abbr>
			<input type="range" bind:value={deck.speed} min={0.5} max={1.5} step={0.1} />
			<output>{deck.speed.toFixed(1)}</output>
		</label>
	</div>
</article>

<style>
	/* Technics 1210 style fast blinking */
	@keyframes blink-led {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.15;
		}
	}

	article {
		display: grid;
		grid-template-rows: auto auto auto auto;
		background: inherit;
		gap: 8px;
		color: var(--c-gray2, var(--gray-11));
	}

	.screen {
		aspect-ratio: 16/9;
		background: var(--c-gray9, var(--gray-1));
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		border-bottom: 4px solid var(--deck-accent, var(--c-gray5, var(--gray-6)));
		box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
	}

	.screen :global(youtube-video) {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: auto;
	}

	.empty {
		color: var(--c-gray5, var(--gray-6));
		font-size: 24px;
	}

	.display {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 1.25em;
		gap: 8px;
		padding: 0 12px;
		overflow: hidden;
	}

	.led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c-gray5, var(--gray-5));
		flex-shrink: 0;
	}

	.led[data-active] {
		background: var(--deck-accent, var(--c-green5, lime));
		box-shadow: 0 0 6px var(--deck-accent, var(--c-green5, lime));
		animation: blink-led 0.2s step-end infinite;
	}

	.title {
		font-size: var(--font-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.counter {
		font-size: var(--font-1);
		font-variant-numeric: tabular-nums;
		color: var(--c-gray3, var(--gray-9));
	}

	.transport {
		display: flex;
		gap: 4px;
		justify-content: center;
	}

	.transport button {
		width: 40px;
		height: 40px;
		border-radius: var(--border-radius);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--c-gray5, var(--gray-4));
		border: 1px solid var(--c-gray4, var(--gray-5));
		color: var(--c-gray2, var(--gray-11));
	}

	.transport button:disabled {
		background: var(--c-gray6, var(--gray-3));
		border-color: var(--c-gray5, var(--gray-4));
		opacity: 0.5;
	}

	.transport button:not(:disabled):hover {
		background: var(--c-gray4, var(--gray-5));
		border-color: var(--deck-accent, var(--c-gray4, var(--gray-5)));
	}

	.transport button:not(:disabled):active {
		background: var(--c-gray4, var(--gray-6));
	}

	.transport button.play {
		width: 56px;
		border-color: var(--deck-accent, var(--c-gray4, var(--gray-5)));
	}

	.transport button.play:not(:disabled) {
		box-shadow: 0 0 8px color-mix(in srgb, var(--deck-accent, transparent) 30%, transparent);
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 12px 12px;
	}

	.controls label {
		display: grid;
		grid-template-columns: 16px 1fr 28px;
		align-items: center;
		gap: 6px;
		font-size: var(--font-1);
	}

	.controls abbr {
		font-weight: 600;
		color: var(--c-gray3, var(--gray-9));
		text-decoration: none;
	}

	.controls input[type='range'] {
		width: 100%;
		margin: 0;
		accent-color: var(--deck-accent, var(--c-gray3, var(--gray-9)));
	}

	.controls output {
		font-variant-numeric: tabular-nums;
		color: var(--c-gray3, var(--gray-9));
		text-align: right;
	}
</style>
