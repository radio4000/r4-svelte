<script>
	import {InfiniteCanvas} from '$lib/infinite-canvas.js'
	import {untrack} from 'svelte'

	/**
	 * @typedef {object} MediaItem
	 * @prop {string} url
	 * @prop {number} [width]
	 * @prop {number} [height]
	 * @prop {string} [slug]
	 * @prop {string} [id]
	 * @prop {string} [title]
	 * @prop {string} [channel_slug]
	 * @prop {{slug?: string}} [channel]
	 */

	/** @type {{media?: MediaItem[], activeId?: string, backgroundColor?: string|null, fogColor?: string|null, onclick?: (item: MediaItem) => void}} */
	let {media = [], activeId, backgroundColor = null, fogColor = null, onclick} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvas} */
	let canvas

	function getThemeColor(variable) {
		if (typeof document === 'undefined') return '#ff0000'

		// Resolve CSS variable (and light-dark) via a temp element
		// getComputedStyle().color returns rgb() format which Three.js accepts directly
		const div = document.createElement('div')
		div.style.color = `var(${variable})`
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.appendChild(div)
		const color = getComputedStyle(div).color
		document.body.removeChild(div)

		return color
	}

	$effect(() => {
		if (!container) return
		const accentColor = getThemeColor('--accent-9')
		canvas = new InfiniteCanvas(container, {
			media: untrack(() => media),
			activeId: untrack(() => activeId),
			accentColor,
			backgroundColor,
			fogColor,
			onClick: onclick
		})
		return () => canvas?.dispose()
	})

	$effect(() => {
		if (canvas && media) canvas.setMedia(media)
	})

	$effect(() => {
		if (canvas && activeId) canvas.setActiveId(activeId)
	})
</script>

<div class="canvas-wrapper">
	<div class="canvas-container" bind:this={container}></div>

	<aside class="controls-hint">
		<div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move</div>
		<div><kbd>Q</kbd><kbd>E</kbd> up/down · <kbd>scroll</kbd> zoom</div>
		<div>Drag to pan · Click to play</div>
	</aside>
</div>

<style>
	.canvas-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.canvas-container {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.controls-hint {
		position: absolute;
		bottom: var(--space-2);
		right: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-2);
		line-height: 1.6;
		pointer-events: none;
		text-align: right;
	}
</style>
