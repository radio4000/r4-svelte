import {redirect} from '@sveltejs/kit'

export function load({url}) {
	redirect(307, `/explore/feed${url.search}`)
}
