import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

export function load({url}) {
	redirect(307, `${resolve('explore/channels/all')}${url.search}`)
}
