import {redirect} from '@sveltejs/kit'

const VALID = new Set(['recent', 'featured'])

export function load({params}) {
	redirect(307, VALID.has(params.filter) ? `/tracks/${params.filter}` : '/tracks/recent')
}
