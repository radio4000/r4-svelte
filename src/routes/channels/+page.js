import {redirect} from '@sveltejs/kit'
import {appState} from '$lib/app-state.svelte'

const filterSlugMap = {
	featured: 'featured',
	all: 'all',
	favorites: 'favorites',
	broadcasting: 'broadcasting',
	artwork: 'with-artwork',
	imported: 'imported',
	'10+': 'with-more-than-10-tracks',
	'100+': 'with-more-than-100-tracks',
	'1000+': 'with-more-than-1000-tracks'
}

export function load() {
	const slug = filterSlugMap[appState.channels_filter] || 'all'
	redirect(307, `/channels/${slug}`)
}
