export type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	sort?: 'newest' | 'oldest'
	limit?: number
}

export function parseView(params: URLSearchParams): View {
	const view: View = {}
	const channels = params.get('channels')
	if (channels) view.channels = channels.split(',').filter(Boolean)
	const tags = params.get('tags')
	if (tags) view.tags = tags.split(',').filter(Boolean)
	const tagsMode = params.get('tagsMode')
	if (tagsMode === 'all') view.tagsMode = 'all'
	const sort = params.get('sort')
	if (sort === 'newest' || sort === 'oldest') view.sort = sort
	const limit = params.get('limit')
	if (limit) {
		const n = Number(limit)
		if (n > 0) view.limit = n
	}
	return view
}

export function serializeView(view: View): URLSearchParams {
	const params = new URLSearchParams()
	if (view.channels?.length) params.set('channels', view.channels.join(','))
	if (view.tags?.length) params.set('tags', view.tags.join(','))
	if (view.tagsMode === 'all') params.set('tagsMode', 'all')
	if (view.sort) params.set('sort', view.sort)
	if (view.limit) params.set('limit', String(view.limit))
	return params
}
