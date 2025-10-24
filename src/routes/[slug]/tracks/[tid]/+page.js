/**
 * Load track data - component will use useLiveQuery
 * @type {import('./$types').PageLoad} */
export async function load({parent, params}) {
	await parent()

	return {
		slug: params.slug,
		tid: params.tid
	}
}
