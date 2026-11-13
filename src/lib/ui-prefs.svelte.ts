import {MediaQuery} from 'svelte/reactivity'
import {appState} from '#lib/app-state.svelte.js'
import {syncAnalyticsConsent} from '#lib/analytics.js'
import {applyCustomCssVariables} from '#lib/apply-css-variables.js'

/**
 * The root layout's preference effects, one function per effect. Each registers a single
 * `$effect` and must be called during component init of `+layout.svelte`, in the order the
 * layout lists them: effect order is behaviour.
 */

const rtlLocales = new Set(['ar', 'ur'])

/** Overwrite on every load — server is authoritative for embed mode. */
export function applyEmbedMode(embedMode: () => boolean) {
	$effect(() => {
		appState.embed_mode = embedMode()
		document.documentElement.classList.toggle('embed-mode', embedMode())
	})
}

/** Theme application: the app theme, or the OS preference when unset. */
export function applyTheme() {
	const prefersLight = new MediaQuery('(prefers-color-scheme: light)')
	const theme = $derived(appState.theme ?? (prefersLight.current ? 'light' : 'dark'))

	$effect(() => {
		const isDark = theme === 'dark'
		document.documentElement.classList.toggle('dark', isDark)
		document.documentElement.classList.toggle('light', !isDark)
		// Status bar follows the app theme, not the OS (--gray-1, as in app.html)
		for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
			meta.setAttribute('content', isDark ? '#15110b' : '#fefbf7')
		}
	})
}

export function applyLocaleAttributes(uiLocale: () => string) {
	$effect(() => {
		if (typeof document === 'undefined') return
		document.documentElement.lang = uiLocale()
		document.documentElement.dir = rtlLocales.has(uiLocale()) ? 'rtl' : 'ltr'
	})
}

export function applyCustomCss() {
	$effect(() => {
		applyCustomCssVariables(appState.custom_css_variables)
	})
}

/** Apply font family */
export function applyFontFamily() {
	$effect(() => {
		const ff = appState.font_family
		if (ff) {
			const value = ff.startsWith('var(') ? `${ff}, sans-serif` : `'${ff}', sans-serif`
			document.documentElement.style.setProperty('--font-sans', value)
		} else {
			document.documentElement.style.removeProperty('--font-sans')
		}
	})
}

/** Sync PostHog opt-in/out with user preference */
export function applyAnalyticsConsent() {
	$effect(() => {
		syncAnalyticsConsent(appState.analytics_opt_in ?? false)
	})
}

/** Apply pointer cursor preference */
export function applyPointerCursor() {
	$effect(() => {
		if (appState.use_pointer_cursor) {
			document.documentElement.style.removeProperty('--interactive-cursor')
		} else {
			document.documentElement.style.setProperty('--interactive-cursor', 'default')
		}
	})
}

/** Apply floating UI preference — padding/gap for the floating card look.
 *  When off, flush the shell but keep --floating-bg / --floating-border so
 *  header, decks, and section seams still use the same tokens (one-sided
 *  dividers via html.no-floating-ui). Corner rounding stays --border-radius. */
export function applyFloatingUi() {
	$effect(() => {
		const root = document.documentElement
		const floating = appState.floating_ui !== false
		root.classList.toggle('no-floating-ui', !floating)
		if (floating) {
			root.style.removeProperty('--floating-padding')
			root.style.removeProperty('--floating-gap')
		} else {
			// 0px, not 0: a bare number makes the shell's max(…, env()) padding invalid
			root.style.setProperty('--floating-padding', '0px')
			root.style.setProperty('--floating-gap', '0')
		}
		// Never override bg/border tokens — flush mode reuses them for seams.
		root.style.removeProperty('--floating-bg')
		root.style.removeProperty('--floating-border')
	})
}

/** Apply "Show borders" preference — see html.no-borders in variables.css. */
export function applyBorders() {
	$effect(() => {
		document.documentElement.classList.toggle('no-borders', appState.show_borders === false)
	})
}
