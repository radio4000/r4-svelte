export type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	search?: string
}

const validOrders = ['updated', 'created', 'name', 'tracks', 'shuffle'] as const
const validDirections = ['asc', 'desc'] as const

export function parseView(params: URLSearchParams): View {
	const view: View = {}
	const channels = params.get('channels')
	if (channels) view.channels = channels.split(',').filter(Boolean)
	const tags = params.get('tags')
	if (tags) view.tags = tags.split(',').filter(Boolean)
	const tagsMode = params.get('tagsMode')
	if (tagsMode === 'all') view.tagsMode = 'all'
	const order = params.get('order')
	if (order && (validOrders as readonly string[]).includes(order)) view.order = order as View['order']
	const direction = params.get('direction')
	if (direction && (validDirections as readonly string[]).includes(direction))
		view.direction = direction as View['direction']
	const limit = params.get('limit')
	if (limit) {
		const n = Number(limit)
		if (n > 0) view.limit = Math.min(n, 4000)
	}
	const search = params.get('search')
	if (search) view.search = search
	return view
}

/** Parse a human query string into a View. `@slug` → channels, `#tag` → tags, rest → search. */
export function parseSearchQueryToView(input: string): View {
	const view: View = {}
	const channels: string[] = []
	const tags: string[] = []
	const rest: string[] = []
	for (const token of input.trim().split(/\s+/).filter(Boolean)) {
		if (token.startsWith('@')) {
			const slug = token.slice(1)
			if (slug) channels.push(slug)
		} else if (token.startsWith('#')) {
			const tag = token.slice(1)
			if (tag) tags.push(tag)
		} else {
			rest.push(token)
		}
	}
	if (channels.length) view.channels = [...new Set(channels)]
	if (tags.length) view.tags = [...new Set(tags)]
	const search = rest.join(' ')
	if (search) view.search = search
	return view
}

export function serializeView(view: View): URLSearchParams {
	const params = new URLSearchParams()
	if (view.channels?.length) params.set('channels', view.channels.join(','))
	if (view.tags?.length) params.set('tags', view.tags.join(','))
	if (view.tagsMode === 'all') params.set('tagsMode', 'all')
	if (view.order) params.set('order', view.order)
	if (view.direction) params.set('direction', view.direction)
	if (view.limit) params.set('limit', String(view.limit))
	if (view.search) params.set('search', view.search)
	return params
}
