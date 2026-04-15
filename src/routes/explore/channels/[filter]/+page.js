import {redirect} from '@sveltejs/kit'

export const ssr = false

const slugToFilter = {
	featured: 'featured',
	all: 'all',
	favorites: 'favorites',
	broadcasting: 'broadcasting',
	'with-artwork': 'artwork',
	imported: 'imported',
	'with-more-than-10-tracks': '10+',
	'with-more-than-100-tracks': '100+',
	'with-more-than-1000-tracks': '1000+'
}

export function load({params, url}) {
	const filter = slugToFilter[params.filter]
	if (!filter) redirect(307, `/explore/channels/all${url.search}`)
	return {filter}
}
