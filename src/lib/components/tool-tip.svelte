<script>
	/* eslint svelte/no-at-html-tags: "off" */
	import {tooltipState} from './tooltip-attachment.svelte.js'
	import {uuid} from '$lib/utils'

	const id = `tooltip-singleton-${uuid()}`
	const supportsAnchorCss = 'anchorName' in document.documentElement.style

	/** @type {HTMLElement | null} */
	let tooltipElement = $state(null)

	/** @type {HTMLElement | null} */
	let currentTarget = $state(null)

	$effect(() => {
		if (!supportsAnchorCss || !tooltipElement) return

		// Clean up previous target
		if (currentTarget && currentTarget.id !== tooltipState.targetId) {
			currentTarget.removeAttribute('aria-describedby')
			// @ts-expect-error - CSS Anchor Positioning API
			currentTarget.style.anchorName = ''
		}

		if (!tooltipState.visible || !tooltipState.targetId) {
			tooltipElement.hidePopover()
			return
		}

		const target = document.getElementById(tooltipState.targetId)
		if (!target) {
			tooltipElement.hidePopover()
			return
		}

		currentTarget = target
		const anchorName = `--anchor-${tooltipState.targetId}`

		target.setAttribute('aria-describedby', id)
		// @ts-expect-error - CSS Anchor Positioning API
		target.style.anchorName = anchorName
		// @ts-expect-error - CSS Anchor Positioning API
		tooltipElement.style.positionAnchor = anchorName

		tooltipElement.showPopover()
	})
</script>

{#if supportsAnchorCss}
	<div bind:this={tooltipElement} {id} popover="hint" role="tooltip" class="tooltip tooltip-{tooltipState.position}">
		{@html tooltipState.content}
	</div>
{/if}

<style>
	.tooltip {
		position: fixed;
		margin: 0;
		padding: 0.2rem 0.5rem;
		font-size: var(--font-3);
		color: var(--gray-12);
		border: 1px solid var(--color-interface-border);
		background: var(--color-interface-elevated);
		border-radius: var(--border-radius);
		max-width: 200px;
		pointer-events: none;
	}

	/* Modern anchor positioning with auto-flip fallbacks */
	@supports (position-area: bottom) {
		@position-try --top {
			position-area: top;
		}
		@position-try --bottom {
			position-area: bottom;
		}
		@position-try --left {
			position-area: left;
		}
		@position-try --right {
			position-area: right;
		}

		.tooltip {
			inset: unset;
			margin: var(--space-1);
			position-try-fallbacks: --top, --bottom, --left, --right;
			position-visibility: anchors-visible;
		}
		.tooltip-top {
			position-area: top;
		}
		.tooltip-bottom {
			position-area: bottom;
		}
		.tooltip-left {
			position-area: left;
		}
		.tooltip-right {
			position-area: right;
		}
	}
</style>
