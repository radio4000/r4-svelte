import {error} from '@sveltejs/kit'
import {listDocs, loadDoc} from '../docs.server.js'

export const prerender = true

export async function entries() {
	const docs = await listDocs()
	return [{slug: ''}, ...docs.map((slug) => ({slug}))]
}

export async function load({params}) {
	const slug = params.slug || 'index'
	const html = await loadDoc(slug)
	if (!html) error(404, `Doc not found: ${slug}.md`)
	return {html, slug}
}
