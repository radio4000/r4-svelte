import {parseView} from '$lib/views'

export function load({url}) {
	return {
		view: parseView(url.searchParams)
	}
}
