import {viewFromUrl} from '$lib/views'

export function load({url}) {
	return {
		view: viewFromUrl(url)
	}
}
