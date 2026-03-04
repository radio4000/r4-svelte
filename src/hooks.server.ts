import {PUBLIC_EMBED_MODE} from '$env/static/public'
import type {Handle} from '@sveltejs/kit'

const EMBED_HOSTS = ['player.radio4000.com', 'r5.i4k.workers.dev']

export const handle: Handle = async ({event, resolve}) => {
	const isEmbedMode = PUBLIC_EMBED_MODE || EMBED_HOSTS.includes(event.url.hostname)
	if (isEmbedMode && !event.url.pathname.startsWith('/embed')) {
		const embedUrl = new URL('/embed', event.url)
		if (event.url.searchParams.has('q')) {
			embedUrl.searchParams.set('q', event.url.searchParams.get('q')!)
		}
		return Response.redirect(embedUrl, 302)
	}
	return resolve(event)
}
