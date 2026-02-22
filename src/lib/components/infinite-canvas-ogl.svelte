<script>
	import {InfiniteCanvasOGL} from '$lib/infinite-canvas-ogl.js'
	import {untrack} from 'svelte'
	import {appState} from '$lib/app-state.svelte'

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
	 * @prop {boolean} [isFavorite]
	 * @prop {boolean} [isLive]
	 * @prop {boolean} [isActive]
	 */

	/** @type {{media?: MediaItem[], activeId?: string, selectedId?: string | null, backgroundColor?: string|null, onclick?: (item: MediaItem) => void}} */
	let {media = [], activeId, selectedId = null, backgroundColor = null, onclick} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvasOGL} */
	let canvas

	function getThemeColor(variable) {
		if (typeof document === 'undefined') return '#ff0000'

		// Resolve CSS variable (and light-dark) via a temp element
		// getComputedStyle().color returns rgb() format which OGL accepts
		const div = document.createElement('div')
		div.style.color = `var(${variable})`
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.appendChild(div)
		const color = getComputedStyle(div).color
		document.body.removeChild(div)

		return color
	}

	function getMediaRadiusPx() {
		if (typeof document === 'undefined') return 0
		const div = document.createElement('div')
		div.style.borderRadius = 'var(--media-radius)'
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.appendChild(div)
		const px = parseFloat(getComputedStyle(div).borderTopLeftRadius || '0')
		document.body.removeChild(div)
		return Number.isFinite(px) ? px : 0
	}

	$effect(() => {
		if (!container) return
		void appState.theme
		void appState.custom_css_variables
		const liveBorderColor = getThemeColor('--accent-9')
		const activeBorderColor = getThemeColor('--gray-5')
		const favoriteBorderColor = getThemeColor('--accent-8')
		const selectedBorderColor = getThemeColor('--accent-7')
		const defaultCardColor = getThemeColor('--gray-1')
		const selectedCardColor = getThemeColor('--gray-2')
		const favoriteCardColor = getThemeColor('--accent-2')
		const activeCardColor = getThemeColor('--accent-9')
		const liveCardColor = getThemeColor('--accent-2')
		const infoBgColor = getThemeColor('--gray-1')
		const infoTextColor = getThemeColor('--gray-12')
		const infoMutedColor = getThemeColor('--gray-10')
		const infoBorderColor = getThemeColor('--gray-5')
		const activeInfoTextColor = getThemeColor('--gray-1')
		const activeInfoMutedColor = getThemeColor('--gray-2')
		const liveBadgeBgColor = getThemeColor('--accent-9')
		const liveBadgeTextColor = getThemeColor('--gray-1')
		const mediaRadiusPx = getMediaRadiusPx()
		const roundArtworks = mediaRadiusPx > 0.01
		const cornerRadius = roundArtworks ? 0.12 : 0
		canvas = new InfiniteCanvasOGL(container, {
			media: untrack(() => media),
			activeId: untrack(() => activeId),
			selectedId: untrack(() => selectedId),
			liveBorderColor,
			activeBorderColor,
			favoriteBorderColor,
			selectedBorderColor,
			defaultCardColor,
			selectedCardColor,
			favoriteCardColor,
			activeCardColor,
			liveCardColor,
			infoBgColor,
			infoTextColor,
			infoMutedColor,
			infoBorderColor,
			activeInfoTextColor,
			activeInfoMutedColor,
			liveBadgeBgColor,
			liveBadgeTextColor,
			roundArtworks,
			cornerRadius,
			backgroundColor,
			onClick: onclick
		})
		return () => canvas?.dispose()
	})

	$effect(() => {
		if (canvas && media) canvas.setMedia(media)
	})

	$effect(() => {
		if (!canvas) return
		canvas.setActiveId(activeId ?? null)
	})

	$effect(() => {
		if (!canvas) return
		canvas.setSelectedId(selectedId)
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
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.canvas-container :global(canvas) {
		position: absolute;
		inset: 0;
		width: 100% !important;
		height: 100% !important;
	}

	.controls-hint {
		position: absolute;
		bottom: var(--space-2);
		right: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-2);
		pointer-events: none;
		text-align: right;
	}

</style>
