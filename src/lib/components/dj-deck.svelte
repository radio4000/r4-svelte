<script module>
	/**
	 * @typedef {{
	 *   id: 'A' | 'B',
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

	$effect(() => {
		if (queue.length > 0) {
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
	<header class="caps">{deck.id}</header>

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
		</label>
		<label>
			<abbr title="Speed">S</abbr>
			<input type="range" bind:value={deck.speed} min={0.5} max={1.5} step={0.1} />
			<output>{deck.speed.toFixed(1)}</output>
		</label>
	</div>
</article>

<style>
	article {
		display: grid;
		grid-template-rows: auto auto auto auto auto;
		background: var(--gray-1);
		padding: 12px;
		gap: 8px;
	}

	header {
		color: var(--gray-9);
	}

	.screen {
		aspect-ratio: 16/9;
		background: var(--gray-3);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.screen :global(youtube-video) {
		width: 100%;
		height: 100%;
	}

	.empty {
		color: var(--gray-6);
		font-size: 24px;
	}

	.display {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		min-height: 1.25em;
		gap: 8px;
	}

	.title {
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.counter {
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--gray-9);
	}

	.transport {
		display: flex;
		gap: 4px;
		justify-content: center;
	}

	.transport button {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray-3);
		border: 1px solid var(--gray-5);
	}

	.transport button:not(:disabled):hover {
		background: var(--gray-4);
	}

	.transport button:not(:disabled):active {
		background: var(--gray-5);
	}

	.transport button.play {
		width: 56px;
	}

	.transport button:disabled {
		opacity: 0.3;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.controls label {
		display: grid;
		grid-template-columns: 16px 1fr 28px;
		align-items: center;
		gap: 6px;
		font-size: 10px;
	}

	.controls abbr {
		font-weight: 600;
		color: var(--gray-9);
		text-decoration: none;
	}

	.controls input[type='range'] {
		width: 100%;
		margin: 0;
		accent-color: var(--gray-9);
	}

	.controls output {
		font-variant-numeric: tabular-nums;
		color: var(--gray-9);
		text-align: right;
	}
</style>
