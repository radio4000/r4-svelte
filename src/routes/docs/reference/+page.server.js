import {readFile} from 'node:fs/promises'
import {error} from '@sveltejs/kit'

export const prerender = true

// Temporarily hidden sections
const HIDDEN = []

export async function load() {
	try {
		const raw = await readFile('docs/reference.json', 'utf-8')
		const overview = JSON.parse(raw)
		for (const key of HIDDEN) delete overview[key]
		return {overview}
	} catch (err) {
		error(500, `Failed to load docs/reference.json: ${err?.message ?? 'unknown error'}`)
	}
}
