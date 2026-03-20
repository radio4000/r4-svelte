/** One source of tracks: which channels, tags, and optional search text. */
export type ViewSource = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}

/** One or more sources merged, with display options. */
export type View = {
	sources: ViewSource[]
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	offset?: number
}

/** A serialized View as a compact string (e.g. `@alice #jazz;@bob #techno synth?order=shuffle`). */
export type ViewURI = string & {readonly __brand: 'ViewURI'}

const validOrders = ['updated', 'created', 'name', 'tracks', 'shuffle'] as const
const validDirections = ['asc', 'desc'] as const
const RE_SPLIT_TOKENS = /\s+/
const RE_R4_PREFIX = /^r4:\/\//

/** Apply order/direction/limit/offset from URLSearchParams onto a View in place. */
function parseOptions(p: URLSearchParams, view: View): void {
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
}

/** Parse a human source string into a ViewSource. `@slug` → channels, `#tag` → tags, rest → search. */
export function parseSource(input: string): ViewSource {
	const source: ViewSource = {}
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
	if (channels.length) source.channels = [...new Set(channels)]
	if (tags.length) source.tags = [...new Set(tags)]
	const search = rest.join(' ')
	if (search) source.search = search
	return source
}

/** Turn a ViewSource back into a human-readable string (also a valid ViewURI segment). */
export function serializeSource(source: ViewSource): ViewURI {
	const parts: string[] = []
	if (source.channels?.length) parts.push(...source.channels.map((s) => `@${s}`))
	if (source.tags?.length) parts.push(...source.tags.map((t) => `#${t}`))
	if (source.search) parts.push(source.search)
	return parts.join(' ') as ViewURI
}

// --- View: full string ↔ View ---

/** Parse a ViewURI string into a View. Handles `;` for multiple sources and `?` for options. Strips `r4://` if present. */
export function parseView(input: string): View {
	const body = input.replace(RE_R4_PREFIX, '')
	const [sourcesPart, optionsPart] = body.split('?')
	const sources = (sourcesPart || '')
		.split(';')
		.map((s) => parseSource(s))
		.filter((s) => Object.keys(s).length > 0)
	const view: View = {sources: sources.length ? sources : [{}]}
	if (optionsPart) {
		const p = new URLSearchParams(optionsPart)
		parseOptions(p, view)
		const tagsMode = p.get('tagsMode')
		if (tagsMode === 'all') {
			for (const s of view.sources) {
				if (!s.tagsMode && s.tags?.length) s.tagsMode = 'all'
			}
		}
	}
	return view
}

/** Serialize a View to a compact ViewURI string. No `r4://` prefix. */
export function serializeView(view: View): ViewURI {
	const sourcesStr = view.sources.map((s) => serializeSource(s)).join(';')
	const options = new URLSearchParams()
	if (view.order) options.set('order', view.order)
	if (view.direction) options.set('direction', view.direction)
	if (view.limit) options.set('limit', String(view.limit))
	if (view.offset) options.set('offset', String(view.offset))
	if (view.sources.some((s) => s.tagsMode === 'all')) options.set('tagsMode', 'all')
	const optStr = options.toString()
	return `${sourcesStr}${optStr ? `?${optStr}` : ''}` as ViewURI
}

/** Extract a View from a URL. Reads `q` param as the human query, plus separate `order`/`direction`/`limit`/`offset` params. */
export function viewFromUrl(url: URL): View {
	const q = url.searchParams.get('q') ?? ''
	const view = parseView(decodeURIComponent(q))
	parseOptions(url.searchParams, view)
	const tagsMode = url.searchParams.get('tagsMode')
	if (tagsMode === 'all') {
		for (const s of view.sources) {
			if (!s.tagsMode && s.tags?.length) s.tagsMode = 'all'
		}
	}
	return view
}

// --- Utilities ---

/** Human-readable label for a View: all sources, no options. */
export function viewLabel(view: View): string {
	return view.sources
		.map((s) => serializeSource(s))
		.filter(Boolean)
		.join('; ')
}

/** Build a URL string from a View and a base path (e.g. '/search', '/search/tracks'). */
export function viewToUrl(basePath: string, view: View): string {
	const params = new URLSearchParams()
	const q = viewLabel(view)
	if (q) params.set('q', q)
	if (view.order) params.set('order', view.order)
	if (view.direction) params.set('direction', view.direction)
	if (view.limit) params.set('limit', String(view.limit))
	if (view.offset) params.set('offset', String(view.offset))
	if (view.sources.some((s) => s.tagsMode === 'all')) params.set('tagsMode', 'all')
	const str = params.toString()
	return str ? `${basePath}?${str}` : basePath
}

/** Remove empty fields so two semantically equivalent views compare equal. */
export function normalizeView(view?: View): View | undefined {
	if (!view) return undefined
	const sources = view.sources
		.map((s) => {
			const normalized: ViewSource = {}
			if (s.channels?.length) normalized.channels = s.channels
			if (s.tags?.length) normalized.tags = s.tags
			if (s.tagsMode === 'all') normalized.tagsMode = 'all'
			const search = s.search?.trim()
			if (search) normalized.search = search
			return Object.keys(normalized).length ? normalized : undefined
		})
		.filter((s): s is ViewSource => s !== undefined)
	if (!sources.length && !view.order && !view.direction && !view.limit && !view.offset) return undefined
	const normalized: View = {sources: sources.length ? sources : [{}]}
	if (view.order) normalized.order = view.order
	if (view.direction) normalized.direction = view.direction
	if (view.limit) normalized.limit = view.limit
	if (view.offset) normalized.offset = view.offset
	return normalized
}

/** Canonical string key for comparing two Views. */
export function viewURI(view?: View): ViewURI {
	const normalized = normalizeView(view)
	return normalized ? serializeView(normalized) : ('' as ViewURI)
}
