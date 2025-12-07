<script>
	/** @type {{value?: number, min?: number, max?: number, step?: number, visualStep?: number, oninput?: (e: Event) => void, [key: string]: any}} */
	let {value = $bindable(0), min = 0, max = 100, step = 4, visualStep, oninput, ...props} = $props()

	let marks = $derived(Math.floor((max - min) / (visualStep ?? step)) + 1)

	/** @type {AudioContext | undefined} */
	let audioContext

	// Create multiple click sound variations using Web Audio API
	function createClickSound(frequency = 800, duration = 0.05) {
		if (!audioContext) {
			// Safari fallback for older versions
			const w = /** @type {{AudioContext?: typeof AudioContext, webkitAudioContext?: typeof AudioContext}} */ (window)
			const AudioContextClass = w.AudioContext || w.webkitAudioContext
			if (AudioContextClass) audioContext = new AudioContextClass()
		}
		if (!audioContext) return
		const oscillator = audioContext.createOscillator()
		const gainNode = audioContext.createGain()

		oscillator.connect(gainNode)
		gainNode.connect(audioContext.destination)

		oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
		oscillator.type = 'square'

		gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
		gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

		oscillator.start(audioContext.currentTime)
		oscillator.stop(audioContext.currentTime + duration)
	}

	function playRandomClick() {
		const frequencies = [600, 700, 800, 900, 1000, 1100]
		const durations = [0.03, 0.04, 0.05, 0.06]
		const frequency = frequencies[Math.floor(Math.random() * frequencies.length)]
		const duration = durations[Math.floor(Math.random() * durations.length)]

		createClickSound(frequency, duration)
	}

	let lastValue = value
	function handleInput() {
		if (Math.abs(value - lastValue) >= step) {
			playRandomClick()
			lastValue = value
		}
	}

	function handleChange(event) {
		oninput?.(event)
	}
</script>

<div class="input-range">
	<input type="range" {min} {max} {step} bind:value oninput={handleInput} onchange={handleChange} {...props} />
	<div class="marks" aria-hidden="true">
		{#each {length: marks}, i (i)}
			<div class="mark"></div>
		{/each}
	</div>
</div>

<style>
	.input-range {
		position: relative;
		display: flex;
	}

	input[type='range'] {
		flex: 1;
		margin: 0;
		background: transparent;
		cursor: pointer;
		position: relative;
		z-index: 2;
		accent-color: var(--accent-9);
	}

	.marks {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		background: var(--gray-1);
		display: flex;
		justify-content: space-between;
	}

	.mark {
		position: relative;
		height: 100%;
		width: 1px;
	}

	.mark::before,
	.mark::after {
		content: '';
		position: absolute;
		left: 0;
		width: 2px;
		height: 6px;
		border-radius: 2px;
		background: var(--color-red);
	}
	.mark::before {
		top: 0;
	}
	.mark::after {
		bottom: 0;
	}
</style>
