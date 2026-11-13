import {fuzzySearch, shuffleArray} from '#lib/utils.js'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import {createQuery, keepPreviousData} from '@tanstack/svelte-query'
import {eq, inArray} from '@tanstack/db'
import {tracksCollection, normalizeTrackMedia} from '#lib/collections/tracks.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {sdk, extractTokens} from '@radio4000/sdk'
import {capabilities} from '#lib/modes.js'
import type {Channel, Deck, Track} from '#lib/types.js'
import {viewURI, type View, type ViewSource} from '#lib/views.js'

const EMPTY_STRINGS: string[] = []

/**
 * Which fetch path queryView uses for a View.
 * - `channel`: one or more channels, nothing else: their full track lists, paginated here
 * - `channel-filtered`: one channel plus tags, mention or text: the same full list,
 *   filtered here (fuzzy text) and paginated here
 * - `remote`: everything else: sdk.searchTracks, matched, ordered, paginated and counted
 *   in the database
 * - `empty`: no source specified, returns nothing
 */
export type ViewStrategy = 'channel' | 'channel-filtered' | 'remote' | 'empty'

type ProcessViewTracksOptions = {
	shuffleRand?: () => number
	/** Set when the caller already passes input sorted by created_at desc, so the default sort can be skipped. */
	inputOrder?: 'created-desc'
}

/** Decide which fetch strategy to use based on the first source of a View. */
export function resolveViewStrategy(source?: ViewSource): ViewStrategy {
	const channels = source?.channels?.length ?? 0
	const filtered = !!source?.tags?.length || !!source?.search?.trim() || !!source?.mention
	if (!channels && !filtered) return 'empty'
	if (!filtered) return 'channel'
	// One channel's tracks are already in the browser. Several together go remote,
	// so a filter doesn't download every channel. Standalone builds have no
	// database and filter whatever is loaded.
	if (channels === 1 || !capabilities.globalBrowse) return 'channel-filtered'
	return 'remote'
}

/** Auto-radio decks matching a specific View identity. */
export function getAutoDecksForView(decks: Deck[], view?: View): Deck[] {
	const key = viewURI(view)
	return decks.filter((d) => d.auto_radio && viewURI(d.view) === key)
}

/**
 * Filter and sort tracks that are already in the browser: every tag, the
 * mention, fuzzy text, then order. For one channel's tracks, decks and
 * standalone builds; searches across channels run in the database instead.
 */
export function processViewTracks(
	tracks: Track[],
	view: View,
	options: ProcessViewTracksOptions = {}
): Track[] {
	let data = tracks
	const q = view.sources[0]
	// Same matching as the database: every tag, and the mention, read from the
	// description with the rule that fills tracks.tags and tracks.mentions.
	const tags = q?.tags?.map((t) => t.toLowerCase())
	const mention = q?.mention?.toLowerCase()
	if (tags?.length || mention) {
		data = data.filter((t) => {
			const found = extractTokens(t.description)
			return (
				(!tags?.length || tags.every((tag) => found.tags.includes(tag))) &&
				(!mention || found.mentions.includes(mention))
			)
		})
	}
	if (q?.search) {
		data = fuzzySearch(q.search, data, ['title', 'description'])
	}
	// Default order is created_at desc; skip the re-sort when the caller says input already is.
	const isDefaultSort = !view.order && (!view.direction || view.direction === 'desc')
	const skipSort = isDefaultSort && !q?.search && options.inputOrder === 'created-desc'
	if (view.order === 'shuffle') {
		data = shuffleArray(data, options.shuffleRand ?? Math.random)
	} else if (!skipSort) {
		const sortField =
			view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
		const dir = view.direction === 'asc' ? 1 : -1
		data = data.toSorted((a, b) => {
			const va = a[sortField] ?? ''
			const vb = b[sortField] ?? ''
			return va < vb ? -dir : va > vb ? dir : 0
		})
	}
	return data
}

/** Parse provider/media_id from URLs, upsert into the collection, return the ids in order. */
function hydrateTracksFromRemote(data: Record<string, unknown>[]): string[] {
	const tracks = (data as Track[]).map(normalizeTrackMedia)
	tracksCollection.utils.writeBatch(() => {
		for (const t of tracks) tracksCollection.utils.writeUpsert(t)
	})
	return tracks.map((t) => t.id)
}

/** `rows` in the order of `ids`; an id missing from `rows` comes from `fallback`, or is skipped. */
export function inIdOrder(
	rows: Track[],
	ids: string[],
	fallback: (id: string) => Track | undefined = () => undefined
): Track[] {
	// A plain lookup built per call, never stored or read reactively
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const byId = new Map(rows.map((t) => [t.id, t]))
	return ids.flatMap((id) => byId.get(id) ?? fallback(id) ?? [])
}

/** Reactive view query. Call during component init. Returns {tracks, channels, loading, strategy} with getters. */
export function queryView(getView: () => View) {
	// Stable $derived primitives — only change when actual query params change.
	const channelSlugs = $derived(getView().sources[0]?.channels ?? EMPTY_STRINGS)
	const channelSlugsKey = $derived(channelSlugs.join(','))
	const tags = $derived(getView().sources[0]?.tags?.toSorted() ?? EMPTY_STRINGS)
	const searchTerm = $derived(getView().sources[0]?.search?.trim() || '')
	const mention = $derived(getView().sources[0]?.mention ?? '')
	const limit = $derived(getView().limit ?? 50)
	const offset = $derived(getView().offset ?? 0)
	const strategy = $derived(resolveViewStrategy(getView().sources[0]))

	const channelsQuery = useLiveQuery(
		(q) => {
			if (!channelSlugs.length) return null
			// One slug asks exactly what the channel layout asks, so they share one cache entry
			return q
				.from({c: channelsCollection})
				.where(({c}) =>
					channelSlugs.length === 1 ? eq(c.slug, channelSlugs[0]) : inArray(c.slug, channelSlugs)
				)
		},
		[() => channelSlugsKey]
	)

	// Both channel strategies read each channel's full track list, the same query the
	// channel layout runs, so they share its cache entry and download nothing it already
	// has. Filters, order and pages apply here, so changing them never refetches.
	const local = $derived(strategy === 'channel' || strategy === 'channel-filtered')
	const tracksQuery = useLiveQuery(
		(q) => {
			if (!local) return null
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) =>
					channelSlugs.length === 1
						? eq(tracks.slug, channelSlugs[0])
						: inArray(tracks.slug, channelSlugs)
				)
				.orderBy(({tracks}) => tracks.created_at, 'desc')
		},
		[() => local, () => channelSlugsKey]
	)

	// Everything else is one database query: channels, every tag, the mention and the
	// text all narrow it, and the database orders, pages and counts.
	const order = $derived(getView().order)
	const ascending = $derived(getView().direction === 'asc')
	const remoteQuery = createQuery(() => ({
		queryKey: [
			'tracks',
			'search',
			{channels: channelSlugs, tags, mention, text: searchTerm, order, ascending, limit, offset}
		],
		queryFn: async () => {
			const {data, error} = await sdk.search.searchTracks(
				{
					channels: channelSlugs,
					tags,
					mentions: mention ? [mention] : [],
					text: searchTerm
				},
				{
					limit,
					offset,
					ascending,
					order: order === 'name' ? 'title' : order === 'updated' ? 'updated_at' : 'created_at'
				}
			)
			if (error) throw new Error(error.message)
			return {ids: hydrateTracksFromRemote(data.tracks), count: data.count}
		},
		enabled: strategy === 'remote',
		staleTime: 24 * 60 * 60 * 1000,
		placeholderData: keepPreviousData
	}))

	// The search returns ids in the server's order; the rows are read back from the
	// collection, so an edit to a track shows here too. Querying by id also owns the
	// rows, so leaving a channel page can't evict a result still on screen.
	const remoteIds = $derived((remoteQuery.data?.ids ?? EMPTY_STRINGS) as string[])
	const remoteIdsKey = $derived(remoteIds.join(','))
	const remoteRowsQuery = useLiveQuery(
		(q) =>
			strategy === 'remote' && remoteIds.length
				? q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, remoteIds))
				: null,
		[() => strategy, () => remoteIdsKey]
	)

	return {
		get strategy() {
			return strategy
		},
		get tracks(): Track[] {
			switch (strategy) {
				case 'channel':
					return processViewTracks(tracksQuery.data as Track[], getView(), {
						inputOrder: 'created-desc'
					}).slice(offset, offset + limit)
				case 'channel-filtered':
					return processViewTracks(tracksQuery.data as Track[], getView()).slice(
						offset,
						offset + limit
					)
				case 'remote': {
					// Until the id query catches up (a new page), read the rows the search just wrote
					const tracks = inIdOrder((remoteRowsQuery.data ?? []) as Track[], remoteIds, (id) =>
						tracksCollection.get(id)
					)
					// Shuffle mixes the current page; the database has no stable random order.
					return getView().order === 'shuffle' ? shuffleArray(tracks, Math.random) : tracks
				}
				default:
					return []
			}
		},
		get count(): number {
			switch (strategy) {
				case 'channel':
					return (tracksQuery.data ?? []).length
				case 'channel-filtered':
					return processViewTracks(tracksQuery.data as Track[], getView()).length
				case 'remote':
					return remoteQuery.data?.count ?? 0
				default:
					return 0
			}
		},
		get channels() {
			return (channelsQuery.data ?? []) as Channel[]
		},
		get loading() {
			switch (strategy) {
				case 'channel':
				case 'channel-filtered':
					return !tracksQuery.isReady
				case 'remote':
					return remoteQuery.isPending
				default:
					return false
			}
		}
	}
}
