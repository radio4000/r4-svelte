<script>
	import {playChannel} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import InputRange from './input-range.svelte'

	const {channels = []} = $props()

	let index = $state(0)
	let autoplay = $state(false)
	/** @type {ReturnType<typeof setTimeout> | null} */
	let playDebounce = null
	const channel = $derived(channels[index] ?? null)

	function prev() {
		index = (index - 1 + channels.length) % channels.length
		if (autoplay) play()
	}

	function next() {
		index = (index + 1) % channels.length
		if (autoplay) play()
	}

	function seek() {
		index = Math.floor(Math.random() * channels.length)
		if (autoplay) play()
	}

	function play() {
		if (!channel) return
		playChannel(appState.active_deck_id, channel)
	}
</script>

<div class="scanner">
	<div class="device">
		<header>
			<p class="slug">{channel ? `@${channel.slug}` : ''}</p>
			<menu>
				<button onclick={prev} title="Previous channel"><Icon icon="previous-fill" /></button>
				<button onclick={play} title="Play this channel"><Icon icon="play-fill" /></button>
				<button onclick={next} title="Next channel"><Icon icon="next-fill" /></button>
				<button onclick={seek} title="Jump to random channel"><Icon icon="shuffle" /></button>
				<button onclick={() => (autoplay = !autoplay)} class:active={autoplay} title="Auto-play on navigation"
					>Auto</button
				>
			</menu>
			<InputRange
				bind:value={index}
				min={0}
				max={channels.length - 1}
				step={1}
				oninput={() => {
					if (!autoplay) return
					if (playDebounce) clearTimeout(playDebounce)
					playDebounce = setTimeout(() => play(), 400)
				}}
			/>
		</header>

		<figure class="spectrum">
			{#each channels as ch, i (ch.id)}
				<button
					class="marker"
					class:tuned={i === index}
					style="left: {(i / (channels.length - 1)) * 100}%"
					title={ch.slug}
					onclick={() => (index = i)}
				>
					<div
						class="marker-signal"
						style="height: {0.5 + Math.min(1, ((ch.track_count ?? 0) / 400) ** 0.8) * 3.5}rem"
					></div>
				</button>
			{/each}
		</figure>

		{#if channel}
			<div class="station">
				<ChannelCard {channel} />
			</div>
		{/if}
	</div>
</div>

<style>
	.scanner {
		display: flex;
		flex-direction: column;
		padding: 1rem;
		align-items: center;
	}

	.device {
		width: 100%;
		max-width: 420px;
		background: var(--gray-3);
		border: 1px solid var(--gray-12);
		border-radius: 2px;
	}

	header {
		display: flex;
		flex-direction: column;
		padding: 0.6rem 0.8rem;
		gap: 0.4rem;
		align-items: center;
		border-bottom: 1px solid var(--gray-10);
	}

	.slug {
		font-size: var(--font-5);
		font-weight: bold;
		margin: 0;
	}

	menu {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin: 0;
		padding: 0;
	}

	.spectrum {
		position: relative;
		height: 3rem;
		margin: 0;
		overflow: hidden;
		border-top: 1px solid var(--gray-10);
		border-bottom: 1px solid var(--gray-10);
		background: var(--gray-5);
	}

	.marker {
		position: absolute;
		bottom: 0;
		transform: translateX(-50%);
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
	}

	.marker-signal {
		width: 2px;
		background: var(--color-red);
		min-height: 5px;
		transition: all 0.2s;
	}

	.marker.tuned .marker-signal {
		background: var(--color-purple);
		height: 100% !important;
		width: 3px;
	}

	:global(header > .input-range) {
		width: 100%;
	}

	.station {
		padding: 1rem;
	}
</style>
