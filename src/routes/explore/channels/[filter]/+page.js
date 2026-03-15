import {redirect} from '@sveltejs/kit'

export const ssr = false

const slugToFilter = {
	featured: 'featured',
	all: 'all',
	broadcasting: 'broadcasting',
	'with-artwork': 'artwork',
	imported: 'imported',
	'with-more-than-10-tracks': '10+',
	'with-more-than-100-tracks': '100+',
	'with-more-than-1000-tracks': '1000+'
}

export function load({params}) {
	const filter = slugToFilter[params.filter]
	if (!filter) redirect(307, '/explore/channels/featured')
	return {filter}
}
