import posthog from 'posthog-js'
import {appState} from '$lib/app-state.svelte'
import {posthogKey} from '$lib/config'

const POSTHOG_KEY = posthogKey
const POSTHOG_HOST = 'https://eu.i.posthog.com'

let initialized = false
let identified = false

/** Initialize PostHog. Only call this when the user has opted in. */
function init() {
	if (initialized) return
	initialized = true
	posthog.init(POSTHOG_KEY, {
		api_host: POSTHOG_HOST,
		defaults: '2026-01-30',
		capture_pageview: false
	})
}

/**
 * Sync PostHog with the current opt-in preference.
 * Pass `appState.analytics_opt_in` explicitly so the caller's reactive context tracks it.
 */
export function syncAnalyticsConsent(optIn: boolean) {
	if (optIn) {
		init()
		posthog.opt_in_capturing()
		// If a user is already logged in when opting in, identify them now
		const user = appState.user
		if (user && !identified) {
			identified = true
			posthog.identify(user.id)
		}
	} else {
		if (initialized) posthog.opt_out_capturing()
	}
}

/**
 * Identify the current user. Call when a user logs in or on app load if already logged in.
 * No-op if the user has not opted in.
 */
export function identify(userId: string, properties?: Record<string, unknown>) {
	if (!appState.analytics_opt_in || !initialized) return
	if (identified) return
	identified = true
	posthog.identify(userId, properties)
}

/**
 * Reset the PostHog identity (e.g. on logout).
 * Unlinks the person profile and creates a new anonymous ID.
 */
export function reset() {
	if (!initialized) return
	identified = false
	posthog.reset()
}

/** Capture a custom event. No-op if the user has not opted in. */
export function capture(event: string, properties?: Record<string, unknown>) {
	if (!appState.analytics_opt_in || !initialized) return
	posthog.capture(event, properties)
}
