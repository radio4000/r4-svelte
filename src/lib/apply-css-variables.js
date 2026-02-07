export function applyCustomCssVariables(customVariables = {}) {
	const root = document.documentElement

	// Reset everything if empty
	if (!Object.keys(customVariables).length) {
		// Clear base colors (scales will fallback to defaults in CSS)
		root.style.removeProperty('--gray-light')
		root.style.removeProperty('--gray-dark')
		root.style.removeProperty('--accent-light')
		root.style.removeProperty('--accent-dark')
		// Clear other custom properties
		root.style.removeProperty('--button-bg')
		root.style.removeProperty('--button-color')
		root.style.removeProperty('--scaling')
		root.style.removeProperty('--border-radius')
		root.style.removeProperty('--media-radius')
		return
	}

	// Set base colors directly - CSS will handle the scales
	for (const prop of ['--accent-light', '--accent-dark', '--gray-light', '--gray-dark']) {
		if (customVariables[prop]) root.style.setProperty(prop, customVariables[prop])
	}

	// Handle button overrides (merge light/dark into light-dark())
	for (const [target, fallback] of [
		['--button-bg', 'var(--gray-1)'],
		['--button-color', 'var(--gray-12)']
	]) {
		const lightVal = customVariables[`${target}-light`]
		const darkVal = customVariables[`${target}-dark`]
		if (lightVal || darkVal) {
			root.style.setProperty(target, `light-dark(${lightVal || fallback}, ${darkVal || fallback})`)
		}
	}

	// Apply all other custom variables (non-generated ones like scaling, border-radius)
	Object.entries(customVariables).forEach(([name, value]) => {
		const systemVariables = [
			'--gray-light',
			'--gray-dark',
			'--accent-light',
			'--accent-dark',
			'--button-bg-light',
			'--button-bg-dark',
			'--button-color-light',
			'--button-color-dark'
		]
		if (value && !systemVariables.includes(name)) {
			root.style.setProperty(name, value)
		}
	})
}
