import {parseView} from '$lib/views.svelte'

export function load({url}) {
	return {
		view: parseView(url.searchParams)
	}
}
