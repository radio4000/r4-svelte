import type {RequestEvent} from '@sveltejs/kit'

export function load({locals}: RequestEvent) {
	return {embedMode: locals.embedMode}
}
