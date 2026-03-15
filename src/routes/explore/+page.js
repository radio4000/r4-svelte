export const ssr = false

export async function load({parent, url}) {
	await parent()
	const display = url.searchParams.get('display')
	const filter = url.searchParams.get('filter')
	return {display, filter}
}
