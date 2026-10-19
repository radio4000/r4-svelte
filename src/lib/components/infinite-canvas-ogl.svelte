<script>
	import {goto} from '$app/navigation'
	import {InfiniteCanvasOGL} from '#lib/infinite-canvas-ogl.js'
	import {untrack} from 'svelte'
	import {appState} from '#lib/app-state.svelte.js'
	import {getChannelSceneThemeConfig} from '#lib/3d/channel-scene-theme.js'
	import Icon from '#lib/components/icon.svelte'
	import Dialog from '#lib/components/dialog.svelte'
	import * as m from '#lib/paraglide/messages.js'

	/** @typedef {import('#lib/components/channel-ui-state.ts').MediaItem} MediaItem */

	/** @type {{media?: MediaItem[], activeId?: string, activeIds?: string[], selectedId?: string | null, hoveredId?: string | null, focusSlug?: string | null, focusKey?: string | null, cardDepthScale?: number, cardSizeScale?: number, backgroundColor?: string|null, onclick?: (item: MediaItem) => void, ondoubleclick?: (item: MediaItem) => void, onnavigate?: (href: string, item: MediaItem, kind: 'channel'|'tag'|'mention'|'tracks'|'rotate'|'favorite', token?: string | null) => void | Promise<void>}} */
	let {
		media = [],
		activeId,
		activeIds = [],
		selectedId = null,
		hoveredId = null,
		focusSlug = null,
		focusKey = null,
		cardDepthScale = 1,
		cardSizeScale = 1,
		backgroundColor = null,
		onclick,
		ondoubleclick,
		onnavigate
	} = $props()

	/** @type {HTMLDivElement} */
	let container
	/** @type {InfiniteCanvasOGL} */
	let canvas
	let lastFocusToken = $state('')
	let showControlsModal = $state(false)

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
			cardDepthScale,
			cardSizeScale,
			...themeConfig,
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

	$effect(() => {
		if (!canvas) return
		const slug = String(focusSlug || '')
			.trim()
			.toLowerCase()
		if (!slug) return
		const token = `${focusKey ?? ''}|${slug}|${media.length}`
		if (token === lastFocusToken) return
		lastFocusToken = token
		canvas.focusBySlug(slug, {duration: 0.6})
	})
</script>

<div class="canvas-wrapper">
	<div class="canvas-container" bind:this={container}></div>

	<button
		class="controls-info-btn"
		type="button"
		onclick={openControls}
		title={m.canvas_controls_button_title()}
	>
		<Icon icon="circle-info" />
	</button>

	<Dialog bind:showModal={showControlsModal}>
		{#snippet header()}
			<h2>{m.canvas_controls_heading()}</h2>
		{/snippet}
		<div class="controls-modal-content">
			<div class="controls-row">
				<Icon icon="hand-pointer" />
				<div>{m.canvas_controls_drag_hint()}</div>
			</div>
			<div class="controls-row">
				<Icon icon="mouse" />
				<div><kbd>scroll</kbd> {m.canvas_controls_zoom_hint()}</div>
			</div>
			<div class="controls-row">
				<Icon icon="keyboard" />
				<div>
					<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
					{m.common_or()} <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
					{m.canvas_controls_move()} ·
					<kbd>Q</kbd><kbd>E</kbd>
					{m.canvas_controls_updown_hint()}
				</div>
			</div>
			<div class="controls-row">
				<Icon icon="circle-info" />
				<div>
					{m.canvas_credit_intro()}
					<a
						href="https://tympanus.net/codrops/2026/01/07/infinite-canvas-building-a-seamless-pan-anywhere-image-space/"
						target="_blank"
						rel="noopener noreferrer">{m.canvas_credit_link()}</a
					>.
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
