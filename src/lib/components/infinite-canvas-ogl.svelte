<script>
	import {goto} from '$app/navigation'
	import {InfiniteCanvasOGL} from '$lib/infinite-canvas-ogl.js'
	import {untrack} from 'svelte'
	import {appState} from '$lib/app-state.svelte'
	import {getChannelSceneThemeConfig} from '$lib/3d/channel-scene-theme.js'
	import Icon from '$lib/components/icon.svelte'
	import Dialog from '$lib/components/dialog.svelte'

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

	<button class="controls-info-btn" type="button" onclick={openControls} title="3D controls">
		<Icon icon="circle-info" size={16} />
	</button>

	<Dialog bind:showModal={showControlsModal}>
		{#snippet header()}
			<h2>3D Controls</h2>
		{/snippet}
		<div class="controls-modal-content">
			<div class="controls-row">
				<Icon icon="hand-pointer" size={16} />
				<div>Drag to pan · Tap/click cards to interact</div>
			</div>
			<div class="controls-row">
				<Icon icon="mouse" size={16} />
				<div><kbd>scroll</kbd> zoom</div>
			</div>
			<div class="controls-row">
				<Icon icon="keyboard" size={16} />
				<div>
					<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move ·
					<kbd>Q</kbd><kbd>E</kbd> up/down
				</div>
			</div>
			<div class="controls-row">
				<Icon icon="circle-info" size={16} />
				<div>
					Infinite mode based on a tutorial from
					<a
						href="https://tympanus.net/codrops/2026/01/07/infinite-canvas-building-a-seamless-pan-anywhere-image-space/"
						target="_blank"
						rel="noopener noreferrer">Edoardo Lunardi on Codrops</a
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
