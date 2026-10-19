import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

export const ssr = false

const VALID = new Set(['featured', 'recent'])

export function load({params, url}) {
	const filter = VALID.has(params.filter) ? params.filter : 'featured'
	if (!VALID.has(params.filter)) redirect(307, `${resolve('explore/tags/featured')}${url.search}`)
	return {filter}
}
