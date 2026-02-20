<script>
	import {untrack} from 'svelte'
	import {createAttachmentKey} from 'svelte/attachments'

	/** @type {{children?: import('svelte').Snippet, trigger?: import('svelte').Snippet, btnClass?: string, closeOnClick?: boolean, onclose?: () => void, triggerAttachment?: Function, align?: 'left' | 'right', [key: string]: any}} */
	let {children, trigger, btnClass, closeOnClick = true, onclose, triggerAttachment, align = 'left', ...rest} = $props()

	const id = $props.id()

	const triggerProps = $derived({
		...(triggerAttachment ? {[createAttachmentKey()]: triggerAttachment} : {}),
		...(btnClass ? {class: btnClass} : {})
	})

	let buttonEl = $state()
	let popoverEl = $state()

	export function close() {
		popoverEl?.hidePopover()
	}

	// Position popover below button and optionally close on action click
	$effect(() => {
		if (!popoverEl) return
		const el = untrack(() => popoverEl)

		const handleToggle = (e) => {
			if (e.newState === 'closed') {
				onclose?.()
				return
			}
			if (!buttonEl) return
			const rect = buttonEl.getBoundingClientRect()
			const popoverRect = el.getBoundingClientRect()
			const left = align === 'right'
				? Math.max(8, rect.right - popoverRect.width)
				: Math.min(rect.left, window.innerWidth - popoverRect.width - 8)
			el.style.top = `${rect.bottom + 4}px`
			el.style.left = `${Math.max(8, left)}px`
		}

		const handleClick = (e) => {
			if (!closeOnClick) return

			const target = e.target
			// Don't close if this is the trigger button
			if (target.hasAttribute('popovertarget')) return

			// Find the clicked interactive element
			const clickedElement = target.closest('button, a')
			if (!clickedElement) return

			// Don't close if the element has data-no-close attribute
			if (clickedElement.hasAttribute('data-no-close')) return

			// Close the popover when clicking buttons/links inside
			el.hidePopover()
		}

		el.addEventListener('toggle', handleToggle)
		el.addEventListener('click', handleClick)
		return () => {
			el.removeEventListener('toggle', handleToggle)
			el.removeEventListener('click', handleClick)
		}
	})
</script>

<div class="popover-menu" {...rest}>
	<button type="button" popovertarget={id} bind:this={buttonEl} {...triggerProps}>
		{@render trigger?.()}
	</button>
	<div popover="auto" {id} bind:this={popoverEl}>
		{@render children?.()}
	</div>
</div>

<style>
	.popover-menu {
		position: relative;
	}

	[popover] {
		position: fixed;
		margin: 0;
		padding: 0.2rem;
		min-width: 10rem;
		background: var(--gray-2);
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		box-shadow: var(--shadow-modal);
	}
</style>
