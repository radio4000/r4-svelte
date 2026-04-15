import {redirect} from '@sveltejs/kit'

const VALID = new Set(['featured', 'recent'])

export function load({params, url}) {
	const path = VALID.has(params.filter) ? `/explore/tags/${params.filter}` : '/explore/tags/featured'
	redirect(307, `${path}${url.search}`)
}
