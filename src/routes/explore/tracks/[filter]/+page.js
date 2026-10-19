import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

export const ssr = false

const validFilters = ['recent', 'featured']

export function load({params, url}) {
	if (!validFilters.includes(params.filter))
		redirect(307, `${resolve('explore/tracks/recent')}${url.search}`)
	return {filter: params.filter}
}
