<script>
	import {tick} from 'svelte'

	/** @type {{children?: import('svelte').Snippet, trigger?: import('svelte').Snippet, btnClass?: string, closeOnClick?: boolean, onclose?: () => void, triggerAttachment?: import('svelte/attachments').Attachment<HTMLButtonElement>, align?: 'left' | 'right' | 'end', valign?: 'top' | 'bottom', centered?: boolean, [key: string]: any}} */
	let {
		children,
		trigger,
		btnClass,
		closeOnClick = true,
		onclose,
		triggerAttachment,
		align = 'left',
		valign = 'bottom',
		centered = false,
		...rest
	} = $props()

	const id = $props.id()

	let buttonEl = $state()
	let popoverEl = $state()
	// The popover (and what's in it) is only created on first open: a long track
	// list has thousands of these menus and most are never opened.
	let hasBeenOpened = $state(false)

	export function close() {
		popoverEl?.hidePopover()
	}

	export async function open() {
		if (!hasBeenOpened) {
			hasBeenOpened = true
			await tick()
		}
		popoverEl?.showPopover({source: buttonEl})
	}

	function positionPopover(el) {
		if (!buttonEl) return
		// Centered mode: let CSS handle placement (see [popover].centered).
		if (centered) {
			el.style.top = ''
			el.style.left = ''
			el.style.transformOrigin = ''
			return
		}
		const rect = buttonEl.getBoundingClientRect()
		const popoverRect = el.getBoundingClientRect()
		const isRTL = document.documentElement.dir === 'rtl'
		const resolvedAlign = align === 'end' ? (isRTL ? 'left' : 'right') : align
		const left =
			resolvedAlign === 'right'
				? Math.max(8, rect.right - popoverRect.width)
				: Math.min(rect.left, window.innerWidth - popoverRect.width - 8)
		// Flip above the trigger when there isn't room below (e.g. a trigger
		// pinned near the bottom of the viewport, like the mobile header).
		const spaceBelow = window.innerHeight - rect.bottom
		const spaceAbove = rect.top
		const opensUp =
			valign === 'top' || (spaceBelow < popoverRect.height + 8 && spaceAbove > spaceBelow)
		const top = opensUp
			? Math.max(8, rect.top - popoverRect.height - 4)
			: Math.min(rect.bottom + 4, window.innerHeight - popoverRect.height - 8)
		el.style.top = `${top}px`
		el.style.left = `${Math.max(8, left)}px`
		// Scale out of the trigger corner instead of the popover's center
		el.style.transformOrigin = `${opensUp ? 'bottom' : 'top'} ${resolvedAlign === 'right' ? 'right' : 'left'}`
	}

	function handleToggle(e) {
		if (e.newState === 'closed') onclose?.()
		else positionPopover(e.currentTarget)
	}

	// Close the popover when clicking buttons/links inside
	function handleClick(e) {
		// A nested menu's trigger opens that menu, it doesn't close this one
		if (!closeOnClick || e.target.hasAttribute('popovertarget')) return
		const clickedElement = e.target.closest('button, a')
		if (!clickedElement || clickedElement.hasAttribute('data-no-close')) return
		popoverEl.hidePopover()
	}
</script>

<div class="popover-menu" {...rest}>
	<button
		type="button"
		popovertarget={hasBeenOpened ? id : undefined}
		bind:this={buttonEl}
		class={btnClass}
		onclick={() => !hasBeenOpened && open()}
		{@attach triggerAttachment}
	>
		{@render trigger?.()}
	</button>
	{#if hasBeenOpened}
		<div
			popover="auto"
			{id}
			class:centered
			bind:this={popoverEl}
			ontoggle={handleToggle}
			onclick={handleClick}
		>
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.popover-menu {
		position: relative;
	}

	[popover] {
		--duration: var(--duration-2);
		position: fixed;
		margin: 0;
		padding: var(--space-1);
		min-width: 10rem;
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		box-shadow: var(--shadow-modal);
		opacity: 1;
		scale: 1;
		transition:
			opacity var(--duration) var(--ease-out),
			scale var(--duration) var(--ease-out),
			display var(--duration) allow-discrete,
			overlay var(--duration) allow-discrete;
	}
	/* exit — quicker than the entrance */
	[popover]:not(:popover-open) {
		--duration: var(--duration-1);
		opacity: 0;
		scale: 0.97;
	}
	@starting-style {
		[popover]:popover-open {
			opacity: 0;
			scale: 0.97;
		}
	}

	/* Centered sheet (opt-in via the `centered` prop). */
	[popover].centered {
		top: 3.25rem;
		left: 50%;
		transform: translateX(-50%);
		width: calc(100vw - 2rem);
		max-width: 26rem;
	}
</style>
