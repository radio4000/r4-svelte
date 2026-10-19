import {redirect} from '@sveltejs/kit'
import {resolve} from '$app/paths'

export function load({params}) {
	throw redirect(307, resolve('/[slug]/following/in-common', {slug: params.slug}))
}
