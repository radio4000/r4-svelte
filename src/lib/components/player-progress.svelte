<script>
	import {formatDuration} from '$lib/dates'

	/** @type {{currentTime: number, mediaDuration: number, trackDuration?: number | null, onseek?: (time: number) => void, disabled?: boolean, isPlaying?: boolean}} */
	let {currentTime, mediaDuration, trackDuration, onseek, disabled = false, isPlaying = false} = $props()

	let duration = $derived(Number.isFinite(mediaDuration) ? mediaDuration : (trackDuration ?? NaN))
	let hasDuration = $derived(Number.isFinite(duration) && duration > 0)
	let fill = $derived(hasDuration ? ((currentTime / duration) * 100).toFixed(1) : '0')
</script>

<menu class="progress">
	<time>{formatDuration(currentTime, '-:--')}</time>
	<input
		type="range"
		min="0"
		max={hasDuration ? duration : 0}
		step="any"
		value={currentTime}
		oninput={(e) => onseek?.(Number(e.currentTarget.value))}
		disabled={disabled || !hasDuration}
		class:inactive={!isPlaying && !disabled}
		style="--range-fill: {fill}%"
	/>
	<time>{formatDuration(duration, '-:--')}</time>
</menu>

<style>
	.progress {
		align-items: center;
		padding: 0.5rem;
		line-height: 1;
	}

	.progress time {
		font-size: var(--font-1);
		color: var(--gray-9);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.progress input {
		flex: 1;
		z-index: 1;
	}

	.progress input.inactive {
		--range-color: var(--gray-6);
	}

	.progress input.inactive::-webkit-slider-thumb {
		background: var(--accent-9);
	}

	.progress input.inactive::-moz-range-thumb {
		background: var(--accent-9);
		border-color: var(--accent-9);
	}
</style>
