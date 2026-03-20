import {fuzzySearch} from '$lib/utils'
import {shuffleArray} from '$lib/utils'
import {useLiveQuery} from '$lib/useLiveQuery.svelte'
import {createQuery} from '@tanstack/svelte-query'
import {eq, inArray} from '@tanstack/db'
import {tracksCollection} from '$lib/collections/tracks'
import {channelsCollection} from '$lib/collections/channels'
import {sdk} from '@radio4000/sdk'
import {parseUrl} from 'media-now'
import type {Channel, Deck, Track} from '$lib/types'
import {viewURI, type View, type ViewSource} from '$lib/views'

/** Max tracks fetched for client-side filtering (search, tags, channel+filter combos). */
const MAX_CLIENT_TRACKS = 4000

/**
 * Which fetch+filter path queryView should use for a View.
 * - `channel`: paginated local query by slug — fast, server-paginated
 * - `channel-filtered`: fetch all channel tracks, post-filter by tags/search, paginate client-side
 * - `tags-only`: remote Supabase overlaps query (tags column), post-filter for tagsMode=all
 * - `search-only`: local FTS live query
 * - `empty`: no source specified, returns nothing
 */
export type ViewStrategy = 'channel' | 'channel-filtered' | 'tags-only' | 'search-only' | 'empty'

/** Decide which fetch strategy to use based on the first source of a View. */
export function resolveViewStrategy(source?: ViewSource): ViewStrategy {
	const hasChannels = !!source?.channels?.length
	const hasTags = !!source?.tags?.length
	const hasSearch = !!source?.search?.trim()
	if (hasChannels && (hasTags || hasSearch)) return 'channel-filtered'
	if (hasChannels) return 'channel'
	if (hasTags) return 'tags-only'
	if (hasSearch) return 'search-only'
	return 'empty'
}

/** Auto-radio decks matching a specific View identity. */
export function getAutoDecksForView(decks: Deck[], view?: View): Deck[] {
	const key = viewURI(view)
	return decks.filter((d) => d.auto_radio && viewURI(d.view) === key)
}

/**
 * Post-process raw tracks: tag post-filtering, fuzzy search, sort/shuffle.
 * This is the "refine locally" stage — input comes from a broad fetch (FTS, overlaps, or channel dump).
 */
export function processViewTracks(tracks: Track[], view: View): Track[] {
	let data = tracks
	const q = view.sources[0]
	// Tag post-filter: channel+tags always needs it; tags-only needs it for tagsMode=all
	// (Supabase overlaps = "any", so "all" mode requires a second pass here)
	if (q?.tags?.length) {
		if (q.tagsMode === 'all') {
			data = data.filter((t) => q.tags?.every((tag) => t.tags?.includes(tag)))
		} else if (q.channels?.length) {
			data = data.filter((t) => t.tags?.some((tag) => q.tags?.includes(tag)))
		}
	}
	if (q?.search) {
		data = fuzzySearch(q.search, data, ['title', 'description'])
	}
	if (view.order === 'shuffle') {
		data = shuffleArray(data)
	} else {
		const sortField = view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
		const dir = view.direction === 'asc' ? 1 : -1
		data = data.toSorted((a, b) => {
			const va = a[sortField] ?? ''
			const vb = b[sortField] ?? ''
			return va < vb ? -dir : va > vb ? dir : 0
		})
	}
	return data
}

/** Reactive view query. Call during component init. Returns {tracks, channels, loading, strategy} with getters. */
export function queryView(getView: () => View) {
	// Stable $derived primitives — only change when actual query params change.
	const channelsKey = $derived(getView().sources[0]?.channels?.join(',') || '')
	const tagsKey = $derived(getView().sources[0]?.tags?.toSorted().join(',') || '')
	const searchKey = $derived(getView().sources[0]?.search?.trim() || '')
	const limitKey = $derived(getView().limit ?? 50)
	const offsetKey = $derived(getView().offset ?? 0)
	const strategy = $derived(resolveViewStrategy(getView().sources[0]))

	const channelsQuery = useLiveQuery(
		(q) => {
			const slugs = channelsKey ? channelsKey.split(',') : []
			if (!slugs.length) return q.from({c: channelsCollection}).where(({c}) => inArray(c.id, ['']))
			return q.from({c: channelsCollection}).where(({c}) => inArray(c.slug, slugs))
		},
		[() => channelsKey]
	)

	// Channel tracks: paginated when strategy=channel, full dump when strategy=channel-filtered
	const tracksQuery = useLiveQuery(
		(q) => {
			if (strategy !== 'channel' && strategy !== 'channel-filtered')
				return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, ['']))
			const slugs = channelsKey.split(',')
			const fetchAll = strategy === 'channel-filtered'
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) => inArray(tracks.slug, slugs))
				.orderBy(({tracks}) => tracks.created_at, 'desc')
				.limit(fetchAll ? MAX_CLIENT_TRACKS : limitKey)
				.offset(fetchAll ? 0 : offsetKey)
		},
		[() => strategy, () => channelsKey, () => searchKey, () => tagsKey, () => limitKey, () => offsetKey]
	)

	// Remote tags query: Supabase overlaps (broad "any" match).
	// createQuery because TanStack DB's inArray can't do array-overlap client-side.
	const tagsQuery = createQuery(() => {
		const tags = tagsKey ? tagsKey.split(',') : []
		return {
			queryKey: ['tracks', 'tags', ...tags],
			queryFn: async () => {
				const {data, error} = await sdk.supabase
					.from('channel_tracks')
					.select('*')
					.overlaps('tags', tags)
					.order('created_at', {ascending: false})
					.limit(MAX_CLIENT_TRACKS)
				if (error) throw error
				const tracks = ((data || []) as Track[]).map((track) => {
					const parsed = track.url ? parseUrl(track.url) : null
					return {
						...track,
						provider: track.provider ?? parsed?.provider ?? null,
						media_id: track.media_id ?? parsed?.id ?? null
					}
				})
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			},
			enabled: strategy === 'tags-only',
			staleTime: 24 * 60 * 60 * 1000
		}
	})

	// Local FTS live query
	const searchLiveQuery = useLiveQuery(
		(q) => {
			if (strategy !== 'search-only') return null
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) => eq(tracks.fts, searchKey))
				.orderBy(({tracks}) => tracks.created_at, 'desc')
				.limit(MAX_CLIENT_TRACKS)
		},
		[() => strategy, () => searchKey]
	)

	return {
		get strategy() {
			return strategy
		},
		get tracks() {
			const v = getView()
			let data: Track[]
			switch (strategy) {
				case 'channel':
				case 'channel-filtered':
					data = (tracksQuery.data ?? []) as Track[]
					break
				case 'tags-only':
					data = (tagsQuery.data ?? []) as Track[]
					break
				case 'search-only':
					data = (searchLiveQuery.data ?? []) as Track[]
					break
				default:
					data = []
			}
			const processed = processViewTracks(data, v)
			// Client-side pagination for strategies that fetch broadly
			if (strategy !== 'channel' && strategy !== 'empty') {
				return processed.slice(offsetKey, offsetKey + limitKey)
			}
			return processed
		},
		get count(): number {
			switch (strategy) {
				case 'channel-filtered': {
					const data = (tracksQuery.data ?? []) as Track[]
					return processViewTracks(data, getView()).length
				}
				case 'tags-only':
					return (tagsQuery.data ?? []).length
				case 'search-only':
					return (searchLiveQuery.data ?? []).length
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
				case 'tags-only':
					return tagsQuery.isPending
				case 'search-only':
					return !searchLiveQuery.isReady
				default:
					return false
			}
		}
	}
}
