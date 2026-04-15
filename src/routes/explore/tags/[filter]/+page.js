import {redirect} from '@sveltejs/kit'

export const ssr = false

const VALID = new Set(['featured', 'recent'])

export function load({params, url}) {
	const filter = VALID.has(params.filter) ? params.filter : 'featured'
	if (!VALID.has(params.filter)) redirect(307, `/explore/tags/featured${url.search}`)
	return {filter}
}
