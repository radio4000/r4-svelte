import {env} from '$env/dynamic/public'
import type {Handle} from '@sveltejs/kit'

const EMBED_HOSTS = ['player.radio4000.com', 'r5.i4k.workers.dev']

export const handle: Handle = async ({event, resolve}) => {
	const isEmbedMode = env.PUBLIC_EMBED_MODE || EMBED_HOSTS.includes(event.url.hostname)
	if (isEmbedMode && !event.url.pathname.startsWith('/embed')) {
		const embedUrl = new URL('/embed', event.url)
		const q = event.url.searchParams.get('q')
		if (q) {
			embedUrl.searchParams.set('q', q)
		}
		return Response.redirect(embedUrl, 302)
	}
	return resolve(event)
}
