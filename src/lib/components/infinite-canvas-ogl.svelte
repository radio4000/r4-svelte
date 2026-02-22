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
	 * @prop {string} [description]
	 * @prop {string} [channel_slug]
	 * @prop {{slug?: string}} [channel]
	 * @prop {boolean} [isFavorite]
	 * @prop {boolean} [isLive]
	 * @prop {boolean} [isPlaying]
	 * @prop {string[]} [tags]
	 * @prop {string[]} [mentions]
	 * @prop {string[]} [activeTags]
	 * @prop {string[]} [activeMentions]
	 * @prop {boolean} [isActive]
	 */

	/** @type {{media?: MediaItem[], activeId?: string, activeIds?: string[], selectedId?: string | null, backgroundColor?: string|null, onclick?: (item: MediaItem) => void, onnavigate?: (href: string, item: MediaItem, kind: 'channel'|'tag'|'mention'|'tracks', token?: string | null) => void | Promise<void>}} */
	let {media = [], activeId, activeIds = [], selectedId = null, backgroundColor = null, onclick, onnavigate} = $props()

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
		const hoverBorderColor = getThemeColor('--gray-5')
		const activeBorderColor = hoverBorderColor
		const favoriteBorderColor = getThemeColor('--accent-8')
		const selectedBorderColor = getThemeColor('--accent-7')
		const defaultCardColor = getThemeColor('--gray-1')
		const selectedCardColor = getThemeColor('--gray-2')
		const favoriteCardColor = getThemeColor('--accent-2')
		const playingCardColor = getThemeColor('--accent-3')
		const activeCardColor = getThemeColor('--accent-4')
		const liveCardColor = getThemeColor('--accent-2')
		const infoBgColor = getThemeColor('--gray-1')
		const infoTextColor = getThemeColor('--gray-12')
		const infoMutedColor = getThemeColor('--gray-10')
		const tagBgColor = getThemeColor('--accent-4')
		const tagTextColor = getThemeColor('--accent-11')
		const tagHoverBgColor = getThemeColor('--accent-5')
		const tagHoverBorderColor = getThemeColor('--gray-6')
		const tagActiveBgColor = getThemeColor('--accent-9')
		const tagActiveTextColor = getThemeColor('--gray-1')
		const tagActiveBorderColor = getThemeColor('--accent-9')
		const infoBorderColor = getThemeColor('--gray-5')
		const activeInfoTextColor = getThemeColor('--gray-1')
		const activeInfoMutedColor = getThemeColor('--gray-2')
		const liveBadgeBgColor = getThemeColor('--accent-9')
		const liveBadgeTextColor = getThemeColor('--gray-1')
		const tagBadgeColor = getThemeColor('--accent-9')
		const mediaRadiusPx = getMediaRadiusPx()
		const roundArtworks = mediaRadiusPx > 0.01
		const cornerRadius = roundArtworks ? 0.12 : 0
		canvas = new InfiniteCanvasOGL(container, {
			media: untrack(() => media),
			activeId: untrack(() => activeId),
			activeIds: untrack(() => activeIds),
			selectedId: untrack(() => selectedId),
			liveBorderColor,
			activeBorderColor,
			hoverBorderColor,
			favoriteBorderColor,
			selectedBorderColor,
			defaultCardColor,
			selectedCardColor,
			favoriteCardColor,
			playingCardColor,
			activeCardColor,
			liveCardColor,
			infoBgColor,
			infoTextColor,
			infoMutedColor,
			tagBgColor,
			tagTextColor,
			tagHoverBgColor,
			tagHoverBorderColor,
			tagActiveBgColor,
			tagActiveTextColor,
			tagActiveBorderColor,
			infoBorderColor,
			activeInfoTextColor,
			activeInfoMutedColor,
			liveBadgeBgColor,
			liveBadgeTextColor,
			tagBadgeColor,
			roundArtworks,
			cornerRadius,
			backgroundColor,
			onClick: onclick,
			onNavigate: onnavigate
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
		canvas.setActiveIds(activeIds)
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
