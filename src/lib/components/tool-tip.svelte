<script>
	/* eslint svelte/no-at-html-tags: "off" */

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
			console.warn(`Tooltip target element with id "${targetId}" not found`)
			return
		}

		// Fallback
		if (!supportsAnchorCss) {
			if (!targetElement.hasAttribute('title')) targetElement.title = content
			return
		}

		if (!tooltipElement) {
			console.warn(`Tooltip element with id "${id}" not found`)
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
		position: absolute;
		margin: 0;
		border: none;
		padding: 0.2rem 0.5rem;
		font-size: var(--font-3);
		color: var(--gray-11);
		border: 1px solid var(--gray-6);
		background: var(--gray-1);
		border-radius: var(--border-radius);
		max-width: 200px;
		pointer-events: none;
	}

	/* Modern anchor positioning */
	@supports (top: anchor(bottom)) {
		.tooltip.tooltip-top {
			inset: unset;
			bottom: calc(anchor(top) - var(--space-1));
			justify-self: anchor-center;
		}

		.tooltip.tooltip-bottom {
			inset: unset;
			top: calc(anchor(bottom) + var(--space-1));
			justify-self: anchor-center;
		}

		.tooltip.tooltip-left {
			inset: unset;
			right: calc(anchor(left) - var(--space-1));
			align-self: anchor-center;
		}

		.tooltip.tooltip-right {
			inset: unset;
			left: calc(anchor(right) + var(--space-1));
			align-self: anchor-center;
		}
	}
</style>
