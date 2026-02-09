/**
 * Listbox keyboard navigation attachment implementing the ARIA listbox pattern.
 * Manages focus, selection, and keyboard interaction for list-based widgets.
 *
 * @see https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 *
 * @param {Object} options
 * @param {(index: number, element: HTMLElement) => void} [options.onSelect] - Called on Enter/Space
 * @param {(index: number, element: HTMLElement) => void} [options.onChange] - Called when active item changes
 * @param {boolean} [options.wrap=false] - Wrap navigation at list boundaries
 * @param {boolean} [options.selectOnClick=false] - Trigger onSelect when clicking an option
 * @returns {(element: HTMLElement) => () => void}
 */
export function listboxNav({onSelect, onChange, wrap = false, selectOnClick = false} = {}) {
	return (element) => {
		let activeIndex = -1

		const getItems = () => /** @type {HTMLElement[]} */ ([...element.querySelectorAll('[role="option"]')])

		const setActive = (index, items = getItems()) => {
			if (!items.length) return

			// Clamp or wrap index
			if (wrap) {
				index = ((index % items.length) + items.length) % items.length
			} else {
				index = Math.max(0, Math.min(index, items.length - 1))
			}

			// Skip if unchanged
			if (index === activeIndex) return

			// Update ARIA attributes
			for (let i = 0; i < items.length; i++) {
				items[i].setAttribute('aria-selected', String(i === index))
			}

			activeIndex = index
			const activeItem = items[index]

			element.setAttribute('aria-activedescendant', activeItem.id)
			activeItem.scrollIntoView({block: 'nearest'})

			onChange?.(index, activeItem)
		}

		const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
			const items = getItems()
			if (!items.length) return

			let handled = true

			switch (e.key) {
				case 'ArrowDown':
					// case 'j':
					setActive(activeIndex + 1, items)
					break
				case 'ArrowUp':
					// case 'k':
					setActive(activeIndex - 1, items)
					break
				case 'Home':
					setActive(0, items)
					break
				case 'End':
					setActive(items.length - 1, items)
					break
				case 'Enter':
				case ' ':
					if (activeIndex >= 0) onSelect?.(activeIndex, items[activeIndex])
					break
				default:
					handled = false
			}

			if (handled) e.preventDefault()
		}

		const handleClick = (/** @type {MouseEvent} */ e) => {
			const target = /** @type {HTMLElement} */ (e.target)
			const option = target.closest('[role="option"]')
			if (!option) return

			const items = getItems()
			const index = items.indexOf(/** @type {HTMLElement} */ (option))
			if (index >= 0) {
				setActive(index, items)
				// Don't trigger onSelect if clicking an interactive element inside the option
				if (selectOnClick && !target.closest('button, a, input, [role="button"]')) {
					onSelect?.(index, items[index])
				}
			}
		}

		const handleFocus = () => {
			if (activeIndex === -1) setActive(0)
		}

		element.addEventListener('keydown', handleKeydown)
		element.addEventListener('click', handleClick)
		element.addEventListener('focus', handleFocus)

		return () => {
			element.removeEventListener('keydown', handleKeydown)
			element.removeEventListener('click', handleClick)
			element.removeEventListener('focus', handleFocus)
		}
	}
}
