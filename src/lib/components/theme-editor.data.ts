import * as m from '#lib/paraglide/messages.js'

type ColorVar = {
	name: string
	label: () => string
	theme: 'light' | 'dark'
	/** Base scale source — must match theme-1.css. */
	default?: string
	/** Read default from computed .btn styles; matches buttons.css. */
	probeStyle?: 'backgroundColor' | 'color'
}

export const fontFamilies = [
	{value: '', label: 'Radio Canada (default)'},
	{value: 'Radio Canada', label: 'Radio Canada'},
	{value: 'Epilogue', label: 'Epilogue'},
	{value: 'Firava', label: 'Firava'},
	{value: 'Recursive', label: 'Recursive'},
	{value: 'Rosario', label: 'Rosario'},
	{value: 'Sono', label: 'Sono'},
	{value: 'system-ui', label: 'System'}
]

const baseColors: ColorVar[] = [
	{
		name: '--accent-light',
		label: () => m.theme_color_accent_light_label(),
		default: 'oklch(0.5 0.25 290)',
		theme: 'light'
	},
	{
		name: '--accent-dark',
		label: () => m.theme_color_accent_dark_label(),
		default: 'oklch(0.63 0.2 296)',
		theme: 'dark'
	},
	{
		name: '--gray-light',
		label: () => m.theme_color_gray_label(),
		default: 'oklch(0.67 0.012 70)',
		theme: 'light'
	},
	{
		name: '--gray-dark',
		label: () => m.theme_color_gray_label(),
		default: 'oklch(0.67 0.008 70)',
		theme: 'dark'
	}
]

const overrides: ColorVar[] = [
	{
		name: '--button-bg-light',
		label: () => m.theme_override_button_bg_label_light(),
		probeStyle: 'backgroundColor',
		theme: 'light'
	},
	{
		name: '--button-bg-dark',
		label: () => m.theme_override_button_bg_label_dark(),
		probeStyle: 'backgroundColor',
		theme: 'dark'
	},
	{
		name: '--button-color-light',
		label: () => m.theme_override_button_color_label_light(),
		probeStyle: 'color',
		theme: 'light'
	},
	{
		name: '--button-color-dark',
		label: () => m.theme_override_button_color_label_dark(),
		probeStyle: 'color',
		theme: 'dark'
	}
]

export const colorVars = [...baseColors, ...overrides]
