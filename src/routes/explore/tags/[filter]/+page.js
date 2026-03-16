export const ssr = false

const VALID = new Set(['featured', 'recent'])

export function load({params}) {
	const filter = VALID.has(params.filter) ? params.filter : 'featured'
	return {filter}
}
