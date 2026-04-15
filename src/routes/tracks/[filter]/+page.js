import {redirect} from '@sveltejs/kit'

const VALID = new Set(['recent', 'featured', 'network'])

export function load({params, url}) {
	const path = VALID.has(params.filter) ? `/explore/tracks/${params.filter}` : '/explore/tracks/recent'
	redirect(307, `${path}${url.search}`)
}
