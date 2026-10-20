import type {HandleClientError} from '@sveltejs/kit/hooks'
import {captureError} from '#lib/analytics.js'

// Kit 3 also routes expected errors (404s, error() calls) through here; only report crashes.
// Unhandled window errors and rejections never reach this hook — PostHog autocapture covers those.
export const handleError: HandleClientError = ({error, kind}) => {
	if (kind === 'unknown') captureError(error)
}
