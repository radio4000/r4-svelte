/** @type {import('./$types').LayoutLoad} */
export function load({params}) {
	return {slug: params.slug, tid: params.tid}
}
