import {redirect} from '@sveltejs/kit'

const VALID = new Set([
	'featured',
	'all',
	'favorites',
	'broadcasting',
	'with-artwork',
	'imported',
	'with-more-than-10-tracks',
	'with-more-than-100-tracks',
	'with-more-than-1000-tracks'
])

export function load({params, url}) {
	const path = VALID.has(params.filter) ? `/explore/channels/${params.filter}` : '/explore/channels/all'
	redirect(307, `${path}${url.search}`)
}
