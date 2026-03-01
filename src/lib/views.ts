/** The query part of a view — what to fetch. */
export type ViewSegment = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}

/** A ViewSegment + display options (order, direction, limit). */
export type View = ViewSegment & {
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
}

/** Multiple segments merged into a single queue, with shared display options. */
export type CompositeView = {
	segments: ViewSegment[]
	order?: View['order']
	direction?: View['direction']
	limit?: number
	exclude?: string[]
}

const validOrders = ['updated', 'created', 'name', 'tracks', 'shuffle'] as const
const validDirections = ['asc', 'desc'] as const
const RE_SPLIT_TOKENS = /\s+/
const RE_R4_PREFIX = /^r4:\/\//

// --- Segment: human query string ↔ ViewSegment ---

/** Parse a human query string into a ViewSegment. `@slug` → channels, `#tag` → tags, rest → search. */
export function parseSegment(input: string): ViewSegment {
	const segment: ViewSegment = {}
	const channels: string[] = []
	const tags: string[] = []
	const rest: string[] = []
	for (const token of input.trim().split(RE_SPLIT_TOKENS).filter(Boolean)) {
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
	if (channels.length) segment.channels = [...new Set(channels)]
	if (tags.length) segment.tags = [...new Set(tags)]
	const search = rest.join(' ')
	if (search) segment.search = search
	return segment
}

/** Turn a ViewSegment back into a human-readable query string.
 *  Only represents channels/tags/search — order/direction/limit/tagsMode are params. */
export function serializeSegment(segment: ViewSegment): string {
	const parts: string[] = []
	if (segment.channels?.length) parts.push(...segment.channels.map((s) => `@${s}`))
	if (segment.tags?.length) parts.push(...segment.tags.map((t) => `#${t}`))
	if (segment.search) parts.push(segment.search)
	return parts.join(' ')
}

// --- Params: URLSearchParams ↔ View ---

/** Parse URLSearchParams into a View. */
export function parseParams(params: URLSearchParams): View {
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

/** Serialize a View to URLSearchParams. */
export function serializeParams(view: View): URLSearchParams {
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

// --- View utilities ---

/** Remove empty fields so two semantically equivalent views compare equal. */
export function normalizeView(view?: View): View | undefined {
	if (!view) return undefined
	const normalized: View = {}
	if (view.channels?.length) normalized.channels = view.channels
	if (view.tags?.length) normalized.tags = view.tags
	if (view.tagsMode === 'all') normalized.tagsMode = 'all'
	if (view.order) normalized.order = view.order
	if (view.direction) normalized.direction = view.direction
	if (view.limit) normalized.limit = view.limit
	const search = view.search?.trim()
	if (search) normalized.search = search
	return Object.keys(normalized).length ? normalized : undefined
}

/** Canonical string key for comparing two Views. */
export function viewKey(view?: View): string {
	const normalized = normalizeView(view)
	return normalized ? serializeParams(normalized).toString() : ''
}

// --- URI: string ↔ CompositeView ---

/** Parse an r4:// URI into a CompositeView. */
export function parseUri(uri: string): CompositeView {
	const body = uri.replace(RE_R4_PREFIX, '')
	const [segmentsPart, optionsPart] = body.split('?')
	const segments = (segmentsPart || '')
		.split(';')
		.map((s) => parseSegment(s))
		.filter((s) => Object.keys(s).length > 0)
	const cv: CompositeView = {segments: segments.length ? segments : [{}]}
	if (optionsPart) {
		const p = new URLSearchParams(optionsPart)
		const order = p.get('order')
		if (order && (validOrders as readonly string[]).includes(order)) cv.order = order as View['order']
		const dir = p.get('direction')
		if (dir && (validDirections as readonly string[]).includes(dir)) cv.direction = dir as View['direction']
		const limit = p.get('limit')
		if (limit) {
			const n = Number(limit)
			if (n > 0) cv.limit = Math.min(n, 4000)
		}
		const tagsMode = p.get('tagsMode')
		if (tagsMode === 'all') {
			for (const seg of cv.segments) {
				if (!seg.tagsMode && seg.tags?.length) seg.tagsMode = 'all'
			}
		}
		const exclude = p.get('exclude')
		if (exclude) cv.exclude = exclude.split(',').filter(Boolean)
	}
	return cv
}

/** Serialize a CompositeView to an r4:// URI. */
export function serializeUri(cv: CompositeView): string {
	const segmentStr = cv.segments.map((s) => serializeSegment(s)).join(';')
	const options = new URLSearchParams()
	if (cv.order) options.set('order', cv.order)
	if (cv.direction) options.set('direction', cv.direction)
	if (cv.limit) options.set('limit', String(cv.limit))
	const optStr = options.toString()
	const excludeStr = cv.exclude?.length ? `exclude=${cv.exclude.join(',')}` : ''
	const allOpts = [optStr, excludeStr].filter(Boolean).join('&')
	return `r4://${segmentStr}${allOpts ? '?' + allOpts : ''}`
}
