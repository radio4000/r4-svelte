<script>
	import {generateFrequency} from '$lib/utils.ts'
	import {playChannel} from '$lib/api'
	import ChannelCard from './channel-card.svelte'
	import InputRange from './input-range.svelte'
	import * as m from '$lib/paraglide/messages'
	import {logger} from '$lib/logger'

	const log = logger.ns('spectrum').seal()

	/** @typedef {import('$lib/types').Channel & {frequency: number, signalStrength: number, reception?: number}} ChannelWithFrequency */

	const {channels = [], min = 88.0, max = 108.0} = $props()

	const initialFrequency = Math.random() * (max - min) + min
	let frequency = $state(initialFrequency)
	/** @type {ChannelWithFrequency[]} */
	let channelsWithFrequency = $state([])
	/** @type {ChannelWithFrequency | null} */
	let selectedChannel = $state(null)
	/** @type {ChannelWithFrequency | null} */
	let deferredChannel = $state(null)
	/** @type {ReturnType<typeof setTimeout> | null} */
	let deferTimeout = null
	let isScanning = $state(false)
	let scanDirection = $state(1) // 1 for up, -1 for down
	let autoplay = $state(true)
	/** @type {string | null} */
	let lastPlayedChannelId = $state(null)
	/** @type {ReturnType<typeof setTimeout> | null} */
	let autoplayTimeout = null

	/** @type {AudioContext | null} */
	let audioContext = null
	/** @type {AudioBufferSourceNode | null} */
	let staticNode = null
	/** @type {GainNode | null} */
	let gainNode = null

	// Initialize channels with frequencies and track counts
	$effect(() => {
		processChannels()
	})

	async function processChannels() {
		const processed = []
		for (const channel of channels) {
			const freq = await generateFrequency(channel.name, channel.slug, min, max)
			processed.push({
				...channel,
				frequency: freq,
				signalStrength: Math.min(1, ((channel.track_count ?? 0) / 400) ** 0.8)
			})
		}
		channelsWithFrequency = processed.sort((a, b) => a.frequency - b.frequency)
	}

	// Find closest channel and calculate signal strength
	$effect(() => {
		if (channelsWithFrequency.length === 0) {
			selectedChannel = null
			return
		}

		const closest = channelsWithFrequency.reduce((prev, curr) =>
			Math.abs(curr.frequency - frequency) < Math.abs(prev.frequency - frequency) ? curr : prev
		)

		const distance = Math.abs(closest.frequency - frequency)
		const reception = Math.max(0, 1 - distance / 2) // Clear signal within 2 Hz

		const newChannel = reception > 0.3 ? {...closest, reception} : null

		selectedChannel = newChannel

		// Debounced autoplay when landing on a new channel
		if (autoplay && frequency !== initialFrequency && newChannel && newChannel.id !== lastPlayedChannelId) {
			if (autoplayTimeout) clearTimeout(autoplayTimeout)
			autoplayTimeout = setTimeout(() => {
				if (selectedChannel?.id === newChannel.id) {
					lastPlayedChannelId = newChannel.id
					playChannel(newChannel).catch((err) => log.warn('autoplay failed', {err}))
				}
			}, 500)
		} else if (!newChannel && autoplayTimeout) {
			clearTimeout(autoplayTimeout)
		}

		updateStaticLevel(reception)
	})

	function initAudio() {
		if (!audioContext) {
			const w = /** @type {{AudioContext?: typeof AudioContext, webkitAudioContext?: typeof AudioContext}} */ (window)
			const AudioContextClass = w.AudioContext || w.webkitAudioContext
			if (!AudioContextClass) return
			audioContext = new AudioContextClass()

			// Create static noise
			const bufferSize = audioContext.sampleRate * 2
			const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
			const data = buffer.getChannelData(0)

			for (let i = 0; i < bufferSize; i++) {
				data[i] = (Math.random() - 0.5) * 0.1
			}

			staticNode = audioContext.createBufferSource()
			staticNode.buffer = buffer
			staticNode.loop = true

			gainNode = audioContext.createGain()
			gainNode.gain.value = 0.05

			staticNode.connect(gainNode)
			gainNode.connect(audioContext.destination)
		}
	}

	function updateStaticLevel(reception) {
		if (gainNode && audioContext) {
			const staticLevel = Math.max(0, 0.05 - reception * 0.04)
			gainNode.gain.exponentialRampToValueAtTime(Math.max(staticLevel, 0.001), audioContext.currentTime + 0.1)
		}
	}

	function toggleScanning() {
		if (!isScanning) {
			initAudio()
			staticNode?.start()
			startScanning()
		} else {
			stopScanning()
		}
		isScanning = !isScanning
	}

	let scanInterval
	function startScanning() {
		scanInterval = setInterval(() => {
			frequency += scanDirection * 0.2

			if (frequency >= max) {
				frequency = max
				scanDirection = -1
			} else if (frequency <= min) {
				frequency = min
				scanDirection = 1
			}
		}, 100)
	}

	function stopScanning() {
		clearInterval(scanInterval)
		staticNode?.stop()
		staticNode = null
		gainNode = null
		audioContext = null
	}

	const isStandby = $derived(autoplay && selectedChannel && frequency === initialFrequency)

	// Defer channel card render so it doesn't thrash during rapid tuning
	$effect(() => {
		if (deferTimeout) clearTimeout(deferTimeout)
		if (selectedChannel) {
			deferTimeout = setTimeout(() => {
				deferredChannel = selectedChannel
			}, 60)
		} else {
			deferredChannel = null
		}
	})

	// Signal strength visualization
	const signalBars = $derived.by(() => {
		if (!selectedChannel) return []
		const strength = selectedChannel.reception || 0
		const bars = 8
		return Array.from({length: bars}, (_, i) => ({
			active: i < strength * bars,
			height: Math.random() * 30 + 5 // Slight animation
		}))
	})
</script>

<div class="scanner">
	<div class="device">
		<header>
			<h2>
				{#if isStandby}<span class="led standby" title="Tune to play"></span>{/if}
				<span class="freq">{frequency.toFixed(1)}</span>
				<span class="freq-meta">
					<span class="unit">{m.spectrum_unit_label()}</span>
					{#if selectedChannel}
						<span class="reception"
							>{m.spectrum_signal_strength({percent: Math.round((selectedChannel.reception ?? 0) * 100)})}</span
						>
					{/if}
				</span>
			</h2>

			<menu>
				<button onclick={toggleScanning} class:active={isScanning}>
					{isScanning ? m.spectrum_button_stop() : m.spectrum_button_scan()}
				</button>
				<button onclick={() => (frequency = Math.random() * (max - min) + min)}>{m.spectrum_button_seek()}</button>
				<button onclick={() => (autoplay = !autoplay)} class:active={autoplay}>{m.spectrum_button_auto()}</button>
			</menu>

			<div class="signal-meter">
				{#each signalBars as bar, i (i)}
					<div class="bar" class:active={bar.active} style="height: {bar.height}px"></div>
				{/each}
			</div>
		</header>

		<figure class="spectrum">
			{#each channelsWithFrequency as channel (channel.id)}
				<div
					class="marker"
					class:tuned={selectedChannel?.slug === channel.slug}
					style="left: {((channel.frequency - min) / (max - min)) * 100}%"
					title="{channel.name} - {channel.frequency.toFixed(1)}"
				>
					<div class="marker-signal" style="height: {0.5 + channel.signalStrength * 3.5}rem"></div>
				</div>
			{/each}
		</figure>

		<InputRange bind:value={frequency} {min} {max} step={0.1} />

		{#if deferredChannel}
			<div class="station" style="opacity: {deferredChannel.reception ?? 1}">
				<ChannelCard channel={deferredChannel} />
			</div>
		{:else}
			<div class="static-display">
				<div class="static-text">{m.spectrum_static_text()}</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.scanner {
		display: flex;
		flex-direction: column;
		padding: 1rem;
		min-height: 80vh;
		justify-content: center;
		align-items: center;
		margin: 0 auto;
	}

	.device {
		--border-radius: 2px;
		width: 100%;
		max-width: 420px;
		background: var(--gray-3);
		border: 1px solid var(--gray-12);
		border-radius: var(--border-radius);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.1),
			0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.device > header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.8rem;
		background: #d4d9a8;
		line-height: 1;
		border: 1px solid var(--gray-1);
		border-bottom: 1px solid var(--gray-12);
		border-radius: var(--border-radius);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.25),
			inset 0 2px 4px rgba(0, 0, 0, 0.15);

		h2 {
			display: flex;
			gap: 0.5rem;
		}

		.freq {
			position: relative;
			top: 0.1em;
			font-size: var(--font-9);
			font-weight: bold;
			align-self: flex-end;
		}

		.freq-meta {
			display: flex;
			flex-direction: column;
			align-self: flex-end;
		}

		.led {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex-shrink: 0;
			align-self: flex-start;
			border: 1px solid #000;
		}

		.led.standby {
			background: var(--color-orange, #f59e0b);
			box-shadow: 0 0 6px var(--color-orange, #f59e0b);
			animation: pulse-led 2s ease-in-out infinite;
		}

		.unit {
			font-size: var(--font-2);
			color: var(--gray-9);
		}

		.reception {
			font-size: var(--font-1);
			color: var(--gray-9);
		}

		menu {
			margin: auto 1rem auto auto;
		}

		.signal-meter {
			display: flex;
			gap: 2px;
			align-items: flex-end;
			height: 3rem;
		}
	}

	.bar {
		width: 3px;
		background: var(--color-red);
		min-height: 3px;
		transition: background-color 0.1s;
	}

	.bar.active {
		position: relative;
		color: blue;
		z-index: 1;
	}

	.spectrum {
		position: relative;
		height: 4rem;
		margin: 0;
		pointer-events: none;
		border: 1px solid var(--gray-10);
		background: var(--gray-5);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.marker {
		position: absolute;
		transform: translateX(-50%);
	}

	.marker-signal {
		width: 2px;
		background: var(--color-red);
		min-height: 5px;
		margin: 0 auto;
		transition: all 0.2s;
	}

	.marker.tuned {
		z-index: 1;
		.marker-signal {
			background: var(--color-purple);
			height: 3rem !important;
			width: 3px;
		}
	}

	:global(.device > .input-range) {
		margin: 0;
		border: 1px solid var(--gray-10);
	}

	.station {
		padding: 1rem;
		transition: opacity 0.3s;
	}

	.station :global(.desc) {
		min-height: calc(1.2em * 6);
	}

	.static-display {
		padding: 2rem 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.static-text {
		color: var(--color-gray);
		font-style: italic;
		animation: flicker 0.1s infinite alternate;
	}

	@keyframes flicker {
		0% {
			opacity: 0.3;
		}
		100% {
			opacity: 0.7;
		}
	}

	@keyframes pulse-led {
		0%,
		100% {
			opacity: 0.4;
			box-shadow: 0 0 4px var(--color-orange, #f59e0b);
		}
		50% {
			opacity: 1;
			box-shadow: 0 0 8px var(--color-orange, #f59e0b);
		}
	}
</style>
