import {listDocs, listSubroutes, loadDoc} from './docs.server.js'

export const prerender = true

const docsPrefix = /^\/docs\/?/

export async function load({url}) {
	const slug = url.pathname.replace(docsPrefix, '') || 'index'
	const [docs, subroutes] = await Promise.all([listDocs(), listSubroutes()])
	const html = await loadDoc(slug)
	return {docs, subroutes, html, slug}
}
