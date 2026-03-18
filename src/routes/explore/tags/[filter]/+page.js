import {redirect} from '@sveltejs/kit'

const VALID = new Set(['featured', 'recent'])

export function load({params}) {
	redirect(307, VALID.has(params.filter) ? `/tags/${params.filter}` : '/tags/featured')
}
