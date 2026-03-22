import {captureError} from '$lib/analytics'

export function handleError({error}: {error: unknown}) {
	captureError(error)
}
