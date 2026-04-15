import * as m from '$lib/paraglide/messages'

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

export const baseColors = [
	{
		name: '--accent-light',
		label: () => m.theme_color_accent_light_label(),
		description: () => m.theme_color_accent_desc(),
		default: 'oklch(0.5 0.25 290)',
		theme: 'light'
	},
	{
		name: '--accent-dark',
		label: () => m.theme_color_accent_dark_label(),
		description: () => m.theme_color_accent_desc(),
		default: '#732ff1',
		theme: 'dark'
	},
	{
		name: '--gray-light',
		label: () => m.theme_color_gray_label(),
		description: () => m.theme_color_gray_desc(),
		default: 'oklch(0.67 0.01 0)',
		theme: 'light'
	},
	{
		name: '--gray-dark',
		label: () => m.theme_color_gray_label(),
		description: () => m.theme_color_gray_desc(),
		default: 'oklch(0.67 0.005 0)',
		theme: 'dark'
	}
]

export const overrides = [
	{
		name: '--button-bg-light',
		label: () => m.theme_override_button_bg_label_light(),
		description: () => m.theme_override_button_bg_desc(),
		default: '#fff',
		theme: 'light'
	},
	{
		name: '--button-bg-dark',
		label: () => m.theme_override_button_bg_label_dark(),
		description: () => m.theme_override_button_bg_desc(),
		default: '#000',
		theme: 'dark'
	},
	{
		name: '--button-color-light',
		label: () => m.theme_override_button_color_label_light(),
		description: () => m.theme_override_button_text_desc(),
		default: '#000',
		theme: 'light'
	},
	{
		name: '--button-color-dark',
		label: () => m.theme_override_button_color_label_dark(),
		description: () => m.theme_override_button_text_desc(),
		default: '#fff',
		theme: 'dark'
	}
]

export const grays = Array.from(Array(12).keys(), (i) => `--gray-${i + 1}`)
export const accents = Array.from(Array(12).keys(), (i) => `--accent-${i + 1}`)
