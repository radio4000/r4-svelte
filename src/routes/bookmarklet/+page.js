/** @param {import('@sveltejs/kit').RequestEvent} event */
export function load({url}) {
	return {origin: url.origin}
}
