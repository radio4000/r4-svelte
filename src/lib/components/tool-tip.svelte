<script>
	/* eslint svelte/no-at-html-tags: "off" */
	import {logger} from '$lib/logger'

	const log = logger.ns('tooltip').seal()

	/** @type {{targetId: string, content: string, position?: string}} */
	const {targetId, content = '', position = 'bottom'} = $props()

	const id = $props.id()
	const anchorName = $derived(`--anchor-${id}`)
	/** @type {HTMLElement | null} */ let tooltipElement = $state(null)
	/** @type {HTMLElement | null} */ let targetElement = $state(null)
	const supportsAnchorCss = 'anchorName' in document.documentElement.style

	$effect(() => {
		targetElement = document.getElementById(targetId)

		if (!targetElement) {
			log.warn('target element not found', {targetId})
			return
		}

		// Fallback
		if (!supportsAnchorCss) {
			if (!targetElement.hasAttribute('title')) targetElement.title = content
			return
		}

		if (!tooltipElement) {
			log.warn('tooltip element not found', {id})
			return
		}

		targetElement.setAttribute('aria-describedby', id)
		// @ts-expect-error - CSS Anchor Positioning API
		targetElement.style.anchorName = anchorName
		// @ts-expect-error - CSS Anchor Positioning API
		tooltipElement.style.positionAnchor = anchorName

		const showTooltip = () => tooltipElement?.showPopover()
		const hideTooltip = () => tooltipElement?.hidePopover()

		targetElement.addEventListener('mouseenter', showTooltip)
		targetElement.addEventListener('mouseleave', hideTooltip)
		targetElement.addEventListener('focus', showTooltip)
		targetElement.addEventListener('blur', hideTooltip)

		return () => {
			targetElement?.removeEventListener('mouseenter', showTooltip)
			targetElement?.removeEventListener('mouseleave', hideTooltip)
			targetElement?.removeEventListener('focus', showTooltip)
			targetElement?.removeEventListener('blur', hideTooltip)
		}
	})
</script>

<div bind:this={tooltipElement} {id} popover="hint" role="tooltip" class="tooltip tooltip-{position}">
	{@html content}
</div>

<style>
	.tooltip {
		position: fixed;
		margin: 0;
		padding: 0.2rem 0.5rem;
		font-size: var(--font-3);
		border: 1px solid var(--gray-7);
		background: var(--gray-1);
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
