export type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
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
	if (order && validOrders.includes(order as any)) view.order = order as View['order']
	const direction = params.get('direction')
	if (direction && validDirections.includes(direction as any)) view.direction = direction as View['direction']
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
	if (view.order) params.set('order', view.order)
	if (view.direction) params.set('direction', view.direction)
	if (view.limit) params.set('limit', String(view.limit))
	return params
}
