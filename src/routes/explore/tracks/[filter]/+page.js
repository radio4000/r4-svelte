import {redirect} from '@sveltejs/kit'

export const ssr = false

const validFilters = ['recent', 'featured']

export function load({params, url}) {
	if (!validFilters.includes(params.filter)) redirect(307, `/explore/tracks/recent${url.search}`)
	return {filter: params.filter}
}
