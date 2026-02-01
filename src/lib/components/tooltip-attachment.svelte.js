import {uuid} from '$lib/utils'

/**
 * @typedef {'top' | 'bottom' | 'left' | 'right'} TooltipPosition
 */

/** Shared state for the singleton tooltip */
export const tooltipState = $state({
	/** @type {string | null} */
	targetId: null,
	content: '',
	/** @type {TooltipPosition} */
	position: 'bottom',
	visible: false
})

/**
 * Tooltip attachment - registers hover/focus listeners that control the singleton tooltip
 * @param {{content: string, position?: TooltipPosition}} options
 * @returns {(element: HTMLElement) => () => void}
 */
export function tooltip({content, position = 'bottom'}) {
	return (element) => {
		if (!element.id) {
			element.id = `tooltip-target-${uuid()}`
		}

		const show = () => {
			tooltipState.targetId = element.id
			tooltipState.content = content
			tooltipState.position = position
			tooltipState.visible = true
		}

		const hide = () => {
			// Defer to avoid state mutation during render cycle
			queueMicrotask(() => {
				if (tooltipState.targetId === element.id) {
					tooltipState.visible = false
				}
			})
		}

		element.addEventListener('mouseenter', show)
		element.addEventListener('mouseleave', hide)
		element.addEventListener('focus', show)
		element.addEventListener('blur', hide)

		return () => {
			element.removeEventListener('mouseenter', show)
			element.removeEventListener('mouseleave', hide)
			element.removeEventListener('focus', show)
			element.removeEventListener('blur', hide)
			// Defer to avoid state mutation during render cycle
			queueMicrotask(() => {
				if (tooltipState.targetId === element.id) {
					tooltipState.visible = false
				}
			})
		}
	}
}
