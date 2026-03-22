<script>
	import gsap from 'gsap'
	import {playChannel} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import InputRange from './input-range.svelte'
	import * as m from '$lib/paraglide/messages'

	const {channels = []} = $props()

	let index = $state(0)
	let stationEl = $state()
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

	/** @type {gsap.core.Timeline | null} */
	let tl = null

	$effect(() => {
		index
		if (!stationEl) return
		const els = stationEl.querySelectorAll(':scope .card .body .info')
		if (!els.length) return
		if (tl) tl.kill()
		tl = gsap.timeline()
		tl.fromTo(els, {opacity: 0, y: 6}, {opacity: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power2.out'})
	})
</script>

<div class="scanner">
	{#if channel}
		<div class="station" bind:this={stationEl}>
			<ChannelCard {channel} />
		</div>
	{/if}

	<menu>
		<button onclick={prev} title={m.scanner_previous_channel()}
			><Icon icon="previous-fill" /></button
		>
		<button onclick={play} title={m.scanner_play_channel()}><Icon icon="play-fill" /></button>
		<button onclick={next} title={m.scanner_next_channel()}><Icon icon="next-fill" /></button>
		<button onclick={seek} title={m.scanner_random_channel()}><Icon icon="shuffle" /></button>
		<button
			onclick={() => (autoplay = !autoplay)}
			class:active={autoplay}
			title={m.scanner_autoplay_navigation()}>{m.scanner_auto()}</button
		>
	</menu>

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

	<InputRange
		bind:value={index}
		min={0}
		max={channels.length - 1}
		step={1}
		oninput={() => {
			if (!autoplay) return
			if (playDebounce) clearTimeout(playDebounce)
			playDebounce = setTimeout(play, 400)
		}}
	/>


</div>

<style>
	.scanner {
		--color: var(--gray-12);
		--color-active: var(--accent-7);


		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin-block: 3rem 0;
	}

	menu {
		margin-block-end: 1rem;
	}

	.spectrum {
		position: relative;
		height: 4rem;
		width: 100%;
		margin: 0;
		overflow: hidden;
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

	:global(.input-range) {
		background: var(--color);
	}

	.marker-signal {
		width: 2px;
		background: var(--color);
		min-height: 5px;
		transition: all 0.2s;
	}

	.marker.tuned .marker-signal {
		background: var(--color-active);
		width: 10px;
		z-index: 2;
	}

	:global(.scanner > .input-range) {
		width: 100%;
		height: 40px;
	}

	.station {
		display: flex;
		flex: 1;
		width: 100%;
		padding: 0 1rem;
		place-content: flex-start;
		align-items: center;

		:global(.card) {
			flex: 1;
			flex-flow: row;
			gap: 1rem;
			max-width: 80ch;
		}

		:global(.card figure) {
			max-width: 250px;
			max-height: 250px;
		}
	}
</style>
