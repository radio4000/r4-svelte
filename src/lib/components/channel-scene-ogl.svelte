<script>
	import {goto} from '$app/navigation'
	import {InfiniteCanvasOGL} from '$lib/infinite-canvas-ogl.js'
	import {getChannelSceneThemeConfig} from '$lib/3d/channel-scene-theme.js'
	import {untrack} from 'svelte'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Dialog from '$lib/components/dialog.svelte'

	/** @type {{media?: any[], activeId?: string, activeIds?: string[], selectedId?: string | null, hoveredId?: string | null, cardSize?: number, cardDepthScale?: number, cardSizeScale?: number, allowNavigation?: boolean, enableCardTilt?: boolean, singleSceneConstrainMovement?: boolean, singleSceneMaxXY?: number, singleSceneCardDragRotate?: boolean, singleSceneMouseDrift?: boolean, minCameraZ?: number, maxCameraZ?: number, backgroundColor?: string|null, showInfoButton?: boolean, showControlsModal?: boolean, onclick?: (item: any) => void, ondoubleclick?: (item: any) => void, onnavigate?: (href: string, item: any, kind: 'channel'|'tag'|'mention'|'tracks'|'rotate'|'favorite', token?: string | null) => void | Promise<void>}} */
	let {
		media = [],
		activeId,
		activeIds = [],
		selectedId = null,
		hoveredId = null,
		cardSize = 18,
		cardDepthScale = 1,
		cardSizeScale = 1,
		allowNavigation = false,
		enableCardTilt = true,
		singleSceneConstrainMovement = true,
		singleSceneMaxXY = undefined,
		singleSceneCardDragRotate = false,
		singleSceneMouseDrift = true,
		minCameraZ = 1,
		maxCameraZ = 500,
		backgroundColor = null,
		showInfoButton = true,
		showControlsModal = $bindable(false),
		onclick,
		ondoubleclick,
		onnavigate
	} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvasOGL} */
	let canvas

	function openControls() {
		canvas?.resetView({duration: 0.7, rebuildScene: true})
		showControlsModal = true
	}

	async function handleNavigate(href, item, kind, token) {
		if (onnavigate) {
			await onnavigate(href, item, kind, token)
			return
		}
		if (href) await goto(href)
	}

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
			singleSceneCardDragRotate,
			singleSceneMouseDrift,
			cardDepthScale,
			cardSizeScale,
			singleCardSize: cardSize,
			minCameraZ,
			maxCameraZ,
			backgroundColor,
			onClick: onclick,
			onDoubleClick: ondoubleclick,
			onNavigate: handleNavigate
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

	{#if showInfoButton}
		<button class="controls-info-btn" type="button" onclick={openControls} title="3D controls">
			<Icon icon="circle-info" />
		</button>
	{/if}

	<Dialog bind:showModal={showControlsModal}>
		{#snippet header()}
			<h2>3D Controls</h2>
		{/snippet}
		<div class="controls-modal-content">
			<div class="controls-row">
				<Icon icon="hand-pointer" />
				<div>Drag to pan · Tap/click cards to interact</div>
			</div>
			<div class="controls-row">
				<Icon icon="mouse" />
				<div><kbd>scroll</kbd> zoom</div>
			</div>
			<div class="controls-row">
				<Icon icon="keyboard" />
				<div>
					<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move ·
					<kbd>Q</kbd><kbd>E</kbd> up/down
				</div>
			</div>
		</div>
	</Dialog>
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

	.controls-info-btn {
		position: absolute;
		bottom: var(--space-2);
		right: var(--space-2);
		padding: var(--space-2);
		font-size: var(--font-2);
		z-index: 2;
	}

	.controls-modal-content {
		display: grid;
		gap: var(--space-2);
	}

	.controls-row {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: start;
		gap: var(--space-2);
	}
</style>
