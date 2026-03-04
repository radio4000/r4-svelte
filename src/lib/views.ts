/** Describes which channels and tracks to fetch */
export type ViewQuery = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}

/** One or more queries merged, with display options. */
export type View = {
	queries: ViewQuery[]
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	offset?: number
	exclude?: string[]
}

/** A serialized View as a compact string (e.g. `@alice #jazz;@bob #techno synth?order=shuffle`). */
export type ViewURI = string & {readonly __brand: 'ViewURI'}

const validOrders = ['updated', 'created', 'name', 'tracks', 'shuffle'] as const
const validDirections = ['asc', 'desc'] as const
const RE_SPLIT_TOKENS = /\s+/
const RE_R4_PREFIX = /^r4:\/\//

/** Parse a human query string into a ViewQuery. `@slug` → channels, `#tag` → tags, rest → search. */
export function parseQuery(input: string): ViewQuery {
	const query: ViewQuery = {}
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
	if (channels.length) query.channels = [...new Set(channels)]
	if (tags.length) query.tags = [...new Set(tags)]
	const search = rest.join(' ')
	if (search) query.search = search
	return query
}

/** Turn a ViewQuery back into a human-readable query string (also a valid ViewURI). */
export function serializeQuery(query: ViewQuery): ViewURI {
	const parts: string[] = []
	if (query.channels?.length) parts.push(...query.channels.map((s) => `@${s}`))
	if (query.tags?.length) parts.push(...query.tags.map((t) => `#${t}`))
	if (query.search) parts.push(query.search)
	return parts.join(' ') as ViewURI
}

// --- View: full string ↔ View ---

/** Parse a view string into a View. Handles `;` for multiple queries and `?` for options. Strips `r4://` if present. */
export function parseView(input: string): View {
	const body = input.replace(RE_R4_PREFIX, '')
	const [queriesPart, optionsPart] = body.split('?')
	const queries = (queriesPart || '')
		.split(';')
		.map((s) => parseQuery(s))
		.filter((q) => Object.keys(q).length > 0)
	const view: View = {queries: queries.length ? queries : [{}]}
	if (optionsPart) {
		const p = new URLSearchParams(optionsPart)
		const order = p.get('order')
		if (order && (validOrders as readonly string[]).includes(order)) view.order = order as View['order']
		const dir = p.get('direction')
		if (dir && (validDirections as readonly string[]).includes(dir)) view.direction = dir as View['direction']
		const limit = p.get('limit')
		if (limit) {
			const n = Number(limit)
			if (n > 0) view.limit = Math.min(n, 4000)
		}
		const offset = p.get('offset')
		if (offset) {
			const n = Number(offset)
			if (n > 0) view.offset = n
		}
		const tagsMode = p.get('tagsMode')
		if (tagsMode === 'all') {
			for (const q of view.queries) {
				if (!q.tagsMode && q.tags?.length) q.tagsMode = 'all'
			}
		}
		const exclude = p.get('exclude')
		if (exclude) view.exclude = exclude.split(',').filter(Boolean)
	}
	return view
}

/** Serialize a View to a compact ViewURI string. No `r4://` prefix. */
export function serializeView(view: View): ViewURI {
	const queriesStr = view.queries.map((q) => serializeQuery(q)).join(';')
	const options = new URLSearchParams()
	if (view.order) options.set('order', view.order)
	if (view.direction) options.set('direction', view.direction)
	if (view.limit) options.set('limit', String(view.limit))
	if (view.offset) options.set('offset', String(view.offset))
	if (view.queries.some((q) => q.tagsMode === 'all')) options.set('tagsMode', 'all')
	const optStr = options.toString()
	const excludeStr = view.exclude?.length ? `exclude=${view.exclude.join(',')}` : ''
	const allOpts = [optStr, excludeStr].filter(Boolean).join('&')
	return `${queriesStr}${allOpts ? `?${allOpts}` : ''}` as ViewURI
}

/** Extract a View from a URL. Reads `q` param as the human query, plus separate `order`/`direction`/`limit`/`offset` params. */
export function viewFromUrl(url: URL): View {
	const q = url.searchParams.get('q') ?? ''
	const view = parseView(decodeURIComponent(q))
	const order = url.searchParams.get('order')
	if (order && (validOrders as readonly string[]).includes(order)) view.order = order as View['order']
	const direction = url.searchParams.get('direction')
	if (direction && (validDirections as readonly string[]).includes(direction))
		view.direction = direction as View['direction']
	const limit = url.searchParams.get('limit')
	if (limit) {
		const n = Number(limit)
		if (n > 0) view.limit = Math.min(n, 4000)
	}
	const offset = url.searchParams.get('offset')
	if (offset) {
		const n = Number(offset)
		if (n > 0) view.offset = n
	}
	return view
}

// --- Utilities ---

/** Human-readable label for a View: all queries, no options. */
export function viewLabel(view: View): string {
	return view.queries
		.map((q) => serializeQuery(q))
		.filter(Boolean)
		.join('; ')
}

/** Remove empty fields so two semantically equivalent views compare equal. */
export function normalizeView(view?: View): View | undefined {
	if (!view) return undefined
	const queries = view.queries
		.map((q) => {
			const normalized: ViewQuery = {}
			if (q.channels?.length) normalized.channels = q.channels
			if (q.tags?.length) normalized.tags = q.tags
			if (q.tagsMode === 'all') normalized.tagsMode = 'all'
			const search = q.search?.trim()
			if (search) normalized.search = search
			return Object.keys(normalized).length ? normalized : undefined
		})
		.filter((q): q is ViewQuery => q !== undefined)
	if (!queries.length && !view.order && !view.direction && !view.limit && !view.offset && !view.exclude?.length)
		return undefined
	const normalized: View = {queries: queries.length ? queries : [{}]}
	if (view.order) normalized.order = view.order
	if (view.direction) normalized.direction = view.direction
	if (view.limit) normalized.limit = view.limit
	if (view.offset) normalized.offset = view.offset
	if (view.exclude?.length) normalized.exclude = view.exclude
	return normalized
}

/** Canonical string key for comparing two Views. */
export function viewURI(view?: View): ViewURI {
	const normalized = normalizeView(view)
	return normalized ? serializeView(normalized) : ('' as ViewURI)
}
