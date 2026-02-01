export const DISCOGS_URL = 'discogs.com'
export const DISCOGS_API_URL = 'api.discogs.com'
export const DiscogsResourceTypes = ['release', 'master']

export const fetchDiscogs = async ({id, type = DiscogsResourceTypes[0]}) => {
	const url = `https://${DISCOGS_API_URL}/${type}s/${id}`
	const response = await fetch(url)
	const data = await response.json()
	if (data.errors) {
		throw new Error(data.errors)
	}
	return data
}

export const parseUrl = (url) => {
	try {
		const discogsUrl = new URL(url)
		if (discogsUrl.hostname.endsWith(DISCOGS_URL)) {
			const pathes = discogsUrl.pathname.slice(1).split('/')
			const type = [pathes[0], pathes[1]].find((typeInPath) => {
				return DiscogsResourceTypes.includes(typeInPath)
			})
			if (type) {
				const typeInPathIndex = pathes.indexOf(type)
				const id = pathes.slice(typeInPathIndex + 1)[0].split('-')[0]
				return {id, type}
			}
		}
	} catch {
		return null
	}
	return null
}

export const extractSuggestions = ({year = 0, genres = [], styles = [], labels = []}) => {
	const labelNames = labels?.map(({name}) => name) || []
	return [...genres, ...styles, year, ...labelNames]
		.filter((s) => !!s)
		.map((suggestion) => suggestion.toString().replace(' ', '-').toLowerCase())
}
