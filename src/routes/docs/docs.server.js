import {readdir, readFile} from 'node:fs/promises'
import {Marked} from 'marked'

const marked = new Marked({
	renderer: {
		link({href, title, text}) {
			if (href?.endsWith('.md')) href = `/docs/${href.replace('.md', '')}`
			const titleAttr = title ? ` title="${title}"` : ''
			return `<a href="${href}"${titleAttr}>${text}</a>`
		}
	}
})

export async function listDocs() {
	const files = await readdir('docs')
	return files
		.filter((f) => f.endsWith('.md'))
		.map((f) => f.replace('.md', ''))
		.sort()
}

/** Scan route folders for subroutes (dirs containing +page.svelte inside a parent route dir). */
export async function listSubroutes() {
	const routesDir = 'src/routes/docs'
	const entries = await readdir(routesDir, {withFileTypes: true})
	const parents = entries.filter(
		(e) => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('+')
	)

	/** @type {Record<string, string[]>} */
	const subroutes = {}
	for (const parent of parents) {
		const children = await readdir(`${routesDir}/${parent.name}`, {withFileTypes: true})
		const childRoutes = children
			.filter((c) => c.isDirectory() && !c.name.startsWith('+') && !c.name.startsWith('['))
			.map((c) => c.name)
			.sort()
		if (childRoutes.length) subroutes[parent.name] = childRoutes
	}
	return subroutes
}

export async function loadDoc(slug) {
	if (slug.includes('..')) return null
	try {
		const content = await readFile(`docs/${slug}.md`, 'utf-8')
		return marked.parse(content)
	} catch {
		return null
	}
}
