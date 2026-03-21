import {listDocs, loadDoc} from './docs.server.js'

export const prerender = true

const docsPrefix = /^\/docs\/?/

export async function load({url}) {
	const slug = url.pathname.replace(docsPrefix, '') || 'index'
	const docs = await listDocs()
	const html = await loadDoc(slug)
	return {docs, html, slug}
}
