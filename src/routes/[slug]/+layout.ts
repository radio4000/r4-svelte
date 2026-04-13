import {viewFromUrl} from '$lib/views'
import {redirect} from '@sveltejs/kit'
import {sdk} from '@radio4000/sdk'

const PRIVATE_ROUTE_IDS = new Set([
	'/[slug]/edit',
	'/[slug]/batch-edit',
	'/[slug]/delete',
	'/[slug]/backup',
	'/[slug]/tracks/[tid]/delete',
	'/[slug]/tracks/[tid]/(tabs)/edit'
])

export async function load({url, route, params}) {
	const routeId = route.id ?? ''
	if (PRIVATE_ROUTE_IDS.has(routeId)) {
		const {
			data: {user}
		} = await sdk.supabase.auth.getUser()
		if (!user) {
			const redirectTo = `${url.pathname}${url.search}`
			throw redirect(307, `/auth?redirect=${encodeURIComponent(redirectTo)}`)
		}
		const canEdit = await sdk.channels.canEditChannel(params.slug)
		if (!canEdit) {
			throw redirect(307, `/${params.slug}`)
		}
	}

	return {
		view: viewFromUrl(url)
	}
}
