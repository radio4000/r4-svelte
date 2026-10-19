import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

const VALID = new Set(['featured', 'recent'])

export function load({params, url}) {
	const path = VALID.has(params.filter)
		? `/explore/tags/${params.filter}`
		: '/explore/tags/featured'
	redirect(307, `${resolve(/** @type {any} */ (path.slice(1)))}${url.search}`)
}
