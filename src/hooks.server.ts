import type {Handle} from '@sveltejs/kit/hooks'
import {appMode, appName, appDescription, EMBED_HOSTS} from '#lib/config.js'

/** For the two config strings injected below — env vars, not user text. */
const escapeMarkup = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const handle: Handle = async ({event, resolve}) => {
	const isEmbedMode = !!(appMode === 'embed' || EMBED_HOSTS.includes(event.url.hostname))
	event.locals.embedMode = isEmbedMode
	if (isEmbedMode && !event.url.pathname.startsWith('/embed')) {
		const embedUrl = new URL('/embed', event.url)
		const q = event.url.searchParams.get('q')
		if (q) {
			embedUrl.searchParams.set('q', q)
		}
		return Response.redirect(embedUrl, 302)
	}
	// Pages that render on the server bring their own title via <Seo>. The rest ship an
	// empty shell, so give them the default rather than letting the tab show a raw URL.
	// Injected here instead of app.html, where it would become a duplicate <title>.
	return resolve(event, {
		transformPageChunk: ({html}) => {
			// %sveltekit.head% sits just before </head>, so a page's own title is in this
			// same chunk — checking both together is safe even if the response streams.
			if (!html.includes('</head>') || html.includes('<title>')) return html
			return html.replace(
				'</head>',
				`<title>${escapeMarkup(appName)}</title><meta name="description" content="${escapeMarkup(appDescription)}" /></head>`
			)
		}
	})
}
