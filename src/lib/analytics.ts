import posthog from 'posthog-js'
import {appState} from '#lib/app-state.svelte.js'
import {posthogKey, posthogHost} from '#lib/config.js'
import {addCaptureEvent} from '#lib/collections/capture-events.js'
import {logger} from '#lib/logger.js'

const log = logger.ns('analytics').seal()

let initialized = false
// let identified = false

/** Initialize PostHog. Only call this when the user has opted in. */
function init() {
	if (initialized) return
	initialized = true
	posthog.init(posthogKey, {
		api_host: posthogHost,
		defaults: '2026-01-30',
		capture_pageview: false,
		// Unhandled window errors/rejections. SvelteKit-caught crashes go through captureError instead.
		capture_exceptions: true
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
		// Disabled: all events are anonymous for privacy.
		// If a user is already logged in when opting in, identify them now
		// const user = appState.user
		// if (user && !identified) {
		// 	identified = true
		// 	posthog.identify(user.id)
		// }
		log.debug('opted in to analytics')
	} else {
		if (initialized) posthog.opt_out_capturing()
		log.debug('opted out of analytics')
	}
}

// Disabled: all events are anonymous for privacy.
// export function identify(userId: string, properties?: Record<string, unknown>) {
// 	if (!appState.analytics_opt_in || !initialized) return
// 	if (identified) return
// 	identified = true
// 	posthog.identify(userId, properties)
// }

// Disabled: all events are anonymous for privacy.
// export function reset() {
// 	if (!initialized) return
// 	identified = false
// 	posthog.reset()
// }

/** Capture an error/exception. No-op if the user has not opted in. */
export function captureError(error: unknown) {
	if (!appState.analytics_opt_in || !initialized) return
	// captureException builds $exception_list (required by Error Tracking). Never hand-build $exception.
	posthog.captureException(error)
	log.debug('error captured', error instanceof Error ? error.message : error)
}

/** Capture a custom event. No-op if the user has not opted in. */
export function capture(event: string, properties?: Record<string, unknown>): string {
	log.debug(event, properties)
	const isPosthogInternalEvent = event.startsWith('$')
	if (!isPosthogInternalEvent) addCaptureEvent(event, properties)
	if (!appState.analytics_opt_in || !initialized) return ''
	posthog.capture(event, properties)
	return ''
}
