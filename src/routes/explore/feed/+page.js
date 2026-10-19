import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

export function load({url}) {
	redirect(307, `${resolve('explore/tracks/network')}${url.search}`)
}
