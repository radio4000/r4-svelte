import {redirect} from '@sveltejs/kit'

export const ssr = false

const validFilters = ['recent', 'featured']

export function load({params}) {
	if (!validFilters.includes(params.filter)) redirect(307, '/tracks/recent')
	return {filter: params.filter}
}
