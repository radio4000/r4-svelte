import {fuzzySearch} from '$lib/search'
import {shuffleArray} from '$lib/utils'
import {useLiveQuery} from '$lib/useLiveQuery.svelte'
import {eq, inArray} from '@tanstack/db'
import {tracksCollection} from '$lib/collections/tracks'
import {channelsCollection} from '$lib/collections/channels'
import type {Channel, Deck, Track} from '$lib/types'
import {viewURI, type View} from '$lib/views'

/** Auto-radio decks matching a specific View identity. */
export function getAutoDecksForView(decks: Deck[], view?: View): Deck[] {
	const key = viewURI(view)
	return decks.filter((d) => d.auto_radio && viewURI(d.view) === key)
}

/** Post-process raw tracks according to a View: tag filtering, fuzzy search, sort/shuffle. Pagination (offset/limit) is handled by the fetch layer. */
export function processViewTracks(tracks: Track[], view: View): Track[] {
	let data = tracks
	const q = view.sources[0]
	// Tag post-filtering (channels+tags combo, or tags-only with "all" mode)
	if (q?.channels?.length && q?.tags?.length) {
		if (q.tagsMode === 'all') {
			data = data.filter((t) => q.tags?.every((tag) => t.tags?.includes(tag)))
		} else {
			data = data.filter((t) => t.tags?.some((tag) => q.tags?.includes(tag)))
		}
	} else if (q?.tagsMode === 'all' && q?.tags?.length) {
		// Tags-only with "all" mode: supabase used overlaps (any), so post-filter
		data = data.filter((t) => q.tags?.every((tag) => t.tags?.includes(tag)))
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

/** Reactive view query. Call during component init. Returns {tracks, channels, loading} with getters. */
export function queryView(getView: () => View) {
	// Stable $derived primitives — only change when actual query params change.
	// Prevents re-creating queries on sort/direction/limit changes (same pattern as [slug]/+layout).
	const channelsKey = $derived(getView().sources[0]?.channels?.join(',') || '')
	const tagsKey = $derived(getView().sources[0]?.tags?.toSorted().join(',') || '')
	const searchKey = $derived(getView().sources[0]?.search?.trim() || '')
	const limitKey = $derived(getView().limit ?? 50)
	const offsetKey = $derived(getView().offset ?? 0)

	const channelsQuery = useLiveQuery(
		(q) => {
			const slugs = channelsKey ? channelsKey.split(',') : []
			if (!slugs.length) return q.from({c: channelsCollection}).where(({c}) => inArray(c.id, ['']))
			return q.from({c: channelsCollection}).where(({c}) => inArray(c.slug, slugs))
		},
		[() => channelsKey]
	)

	const tracksQuery = useLiveQuery(
		(q) => {
			const slugs = channelsKey ? channelsKey.split(',') : []
			if (!slugs.length) return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, ['']))
			const fetchAll = !!searchKey || !!tagsKey
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) => inArray(tracks.slug, slugs))
				.orderBy(({tracks}) => tracks.created_at, 'desc')
				.limit(fetchAll ? 4000 : limitKey)
				.offset(fetchAll ? 0 : offsetKey)
		},
		[() => channelsKey, () => searchKey, () => tagsKey, () => limitKey, () => offsetKey]
	)

	const tagsLiveQuery = useLiveQuery(
		(q) => {
			const tags = tagsKey ? tagsKey.split(',') : []
			if (!tags.length || channelsKey) return null
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) => inArray(tracks.tags, tags))
				.orderBy(({tracks}) => tracks.created_at, 'desc')
				.limit(4000)
		},
		[() => tagsKey, () => channelsKey]
	)

	const searchLiveQuery = useLiveQuery(
		(q) => {
			if (!searchKey || channelsKey || tagsKey) return null
			return q
				.from({tracks: tracksCollection})
				.where(({tracks}) => eq(tracks.fts, searchKey))
				.orderBy(({tracks}) => tracks.created_at, 'desc')
				.limit(4000)
		},
		[() => searchKey, () => channelsKey, () => tagsKey]
	)

	return {
		get tracks() {
			const v = getView()
			const data: Track[] = channelsKey
				? ((tracksQuery.data ?? []) as Track[])
				: tagsKey
					? ((tagsLiveQuery.data ?? []) as Track[])
					: searchKey
						? ((searchLiveQuery.data ?? []) as Track[])
						: []
			const processed = processViewTracks(data, v)
			// Paginate client-side when working from the full cached set
			if (channelsKey && (searchKey || tagsKey)) {
				return processed.slice(offsetKey, offsetKey + limitKey)
			}
			if (!channelsKey && (tagsKey || searchKey)) {
				return processed.slice(offsetKey, offsetKey + limitKey)
			}
			return processed
		},
		get count(): number {
			if (searchKey && !channelsKey && !tagsKey) return (searchLiveQuery.data ?? []).length
			if (tagsKey && !channelsKey) return (tagsLiveQuery.data ?? []).length
			// channel+tags or channel+search: count is full filtered result before slicing
			if (channelsKey && (searchKey || tagsKey)) {
				const data = (tracksQuery.data ?? []) as Track[]
				return processViewTracks(data, getView()).length
			}
			return 0
		},
		get channels() {
			return (channelsQuery.data ?? []) as Channel[]
		},
		get loading() {
			return (
				(!!channelsKey && !tracksQuery.isReady) ||
				(!!tagsKey && !channelsKey && !tagsLiveQuery.isReady) ||
				(!!searchKey && !channelsKey && !tagsKey && !searchLiveQuery.isReady)
			)
		}
	}
}
