export const ssr = false

export async function load({parent, url}) {
	await parent()
	const display = url.searchParams.get('display')
	return {display}
}
