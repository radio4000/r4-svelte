<script>
	import {InfiniteCanvas} from '$lib/infinite-canvas.js'

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

	/** @type {{media?: MediaItem[], backgroundColor?: string|null, fogColor?: string|null, onclick?: (item: MediaItem) => void}} */
	let {media = [], backgroundColor = null, fogColor = null, onclick} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvas} */
	let canvas

	$effect(() => {
		if (!container) return
		canvas = new InfiniteCanvas(container, {media, backgroundColor, fogColor, onClick: onclick})
		return () => canvas?.dispose()
	})

	$effect(() => {
		if (canvas && media) canvas.setMedia(media)
	})
</script>

<div class="canvas-container" bind:this={container}></div>

<aside class="controls-hint">
	<div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move</div>
	<div><kbd>Q</kbd><kbd>E</kbd> up/down · <kbd>scroll</kbd> zoom</div>
	<div>Drag to pan · Click to play</div>
</aside>

<style>
	.canvas-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.controls-hint {
		position: fixed;
		bottom: calc(47px + var(--space-2));
		right: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-2);
		line-height: 1.6;
		pointer-events: none;
	}

</style>
