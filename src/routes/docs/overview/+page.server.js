import {readFile, readdir} from 'node:fs/promises'
import {error} from '@sveltejs/kit'

export const prerender = true

// Temporarily hidden sections
const HIDDEN = []

async function getDocSlugs() {
	const files = await readdir('docs')
	return files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''))
}

export async function load() {
	try {
		const [raw, docs] = await Promise.all([readFile('docs/overview.json', 'utf-8'), getDocSlugs()])
		const overview = JSON.parse(raw)
		for (const key of HIDDEN) delete overview[key]
		return {overview, docs: docs.sort()}
	} catch (err) {
		error(500, `Failed to load docs/overview.json: ${err?.message ?? 'unknown error'}`)
	}
}
