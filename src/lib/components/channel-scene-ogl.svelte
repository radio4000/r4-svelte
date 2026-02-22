<script>
	import {InfiniteCanvasOGL} from '$lib/infinite-canvas-ogl.js'
	import {getChannelSceneThemeConfig} from '$lib/3d/channel-scene-theme.js'
	import {untrack} from 'svelte'
	import {appState} from '$lib/app-state.svelte'

	/** @type {{media?: any[], activeId?: string, activeIds?: string[], selectedId?: string | null, hoveredId?: string | null, cardSize?: number, allowNavigation?: boolean, enableCardTilt?: boolean, singleSceneConstrainMovement?: boolean, singleSceneMaxXY?: number, minCameraZ?: number, maxCameraZ?: number, backgroundColor?: string|null, onclick?: (item: any) => void, onnavigate?: (href: string, item: any, kind: 'channel'|'tag'|'mention'|'tracks', token?: string | null) => void | Promise<void>}} */
	let {
		media = [],
		activeId,
		activeIds = [],
		selectedId = null,
		hoveredId = null,
		cardSize = 18,
		allowNavigation = false,
		enableCardTilt = true,
		singleSceneConstrainMovement = true,
		singleSceneMaxXY = undefined,
		minCameraZ = 1,
		maxCameraZ = 500,
		backgroundColor = null,
		onclick,
		onnavigate
	} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvasOGL} */
	let canvas

	$effect(() => {
		if (!container) return
		void appState.theme
		void appState.custom_css_variables
		const themeConfig = getChannelSceneThemeConfig()
		canvas = new InfiniteCanvasOGL(container, {
			media: untrack(() => media),
			activeId: untrack(() => activeId),
			activeIds: untrack(() => activeIds),
			selectedId: untrack(() => selectedId),
			...themeConfig,
			sceneMode: 'single',
			disableNavigation: !allowNavigation,
			enableCardTilt,
			singleSceneConstrainMovement,
			singleSceneMaxXY,
			singleCardSize: cardSize,
			minCameraZ,
			maxCameraZ,
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

	$effect(() => {
		if (!canvas) return
		canvas.setHoveredId(hoveredId ?? null)
	})
</script>

<div class="canvas-wrapper">
	<div class="canvas-container" bind:this={container}></div>
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
</style>
