import {redirect} from '@sveltejs/kit'

const VALID = new Set([
	'featured',
	'all',
	'broadcasting',
	'with-artwork',
	'imported',
	'with-more-than-10-tracks',
	'with-more-than-100-tracks',
	'with-more-than-1000-tracks'
])

export function load({params}) {
	redirect(307, VALID.has(params.filter) ? `/channels/${params.filter}` : '/channels/all')
}
