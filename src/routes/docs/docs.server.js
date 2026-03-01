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

export async function loadDoc(slug) {
	if (slug.includes('..')) return null
	try {
		const content = await readFile(`docs/${slug}.md`, 'utf-8')
		return marked.parse(content)
	} catch {
		return null
	}
}
