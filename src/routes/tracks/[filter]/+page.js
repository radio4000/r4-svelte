import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

const VALID = new Set(['recent', 'featured', 'network'])

export function load({params, url}) {
	const path = VALID.has(params.filter)
		? `/explore/tracks/${params.filter}`
		: '/explore/tracks/recent'
	redirect(307, `${resolve(/** @type {any} */ (path.slice(1)))}${url.search}`)
}
