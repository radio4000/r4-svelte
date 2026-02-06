import {fuzzySearch} from '$lib/search'
import {shuffleArray} from '$lib/utils'
import {createQuery} from '@tanstack/svelte-query'
import {useLiveQuery} from '@tanstack/svelte-db'
import {inArray} from '@tanstack/db'
import {tracksCollection} from '$lib/tanstack/collections'
import {searchTracks} from '$lib/search-fts'
import {sdk} from '@radio4000/sdk'
import type {Track} from '$lib/types'

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
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	if (channels.length) view.channels = [...new Set(channels)]
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	if (tags.length) view.tags = [...new Set(tags)]
	const search = rest.join(' ')
	if (search) view.search = search
	return view
}

export function serializeView(view: View): URLSearchParams {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
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

/** Post-process raw tracks according to a View: tag filtering, fuzzy search, sort/shuffle, limit. */
export function processViewTracks(tracks: Track[], view: View): Track[] {
	let data = tracks
	// Tag post-filtering (channels+tags combo, or tags-only with "all" mode)
	if (view.channels?.length && view.tags?.length) {
		if (view.tagsMode === 'all') {
			data = data.filter((t) => view.tags?.every((tag) => t.tags?.includes(tag)))
		} else {
			data = data.filter((t) => t.tags?.some((tag) => view.tags?.includes(tag)))
		}
	} else if (view.tagsMode === 'all' && view.tags?.length) {
		// Tags-only with "all" mode: supabase used overlaps (any), so post-filter
		data = data.filter((t) => view.tags?.every((tag) => t.tags?.includes(tag)))
	}
	if (view.search) {
		data = fuzzySearch(view.search, data, ['title', 'description'])
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
	if (view.limit) data = data.slice(0, view.limit)
	return data
}

/** Reactive view query. Call during component init. Returns {tracks, loading} with getters. */
export function queryViewTracks(getView: () => View) {
	// Stable $derived primitives — only change when actual query params change.
	// Prevents re-creating queries on sort/direction/limit changes (same pattern as [slug]/+layout).
	const channelsKey = $derived(getView().channels?.join(',') || '')
	const tagsKey = $derived(getView().tags?.toSorted().join(',') || '')
	const searchKey = $derived(getView().search?.trim() || '')

	const channelQuery = useLiveQuery((q) => {
		const channels = channelsKey ? channelsKey.split(',') : []
		if (!channels.length) return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, []))
		return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.slug, channels))
	})

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
					.limit(4000)
				if (error) throw error
				const tracks = (data || []) as Track[]
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			},
			enabled: !!tags.length && !channelsKey,
			staleTime: 24 * 60 * 60 * 1000
		}
	})

	const searchQuery = createQuery(() => {
		const search = searchKey
		return {
			queryKey: ['tracks', 'search', search],
			queryFn: async () => {
				const tracks = (await searchTracks(search, {limit: 4000})) as Track[]
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			},
			enabled: !!search && !channelsKey && !tagsKey,
			staleTime: 24 * 60 * 60 * 1000
		}
	})

	return {
		get tracks() {
			const v = getView()
			const data: Track[] = channelsKey
				? ((channelQuery.data ?? []) as Track[])
				: tagsKey
					? ((tagsQuery.data ?? []) as Track[])
					: searchKey
						? ((searchQuery.data ?? []) as Track[])
						: []
			return processViewTracks(data, v)
		},
		get loading() {
			return (
				(!!channelsKey && !channelQuery.isReady) ||
				(!!tagsKey && !channelsKey && tagsQuery.isPending) ||
				(!!searchKey && !channelsKey && !tagsKey && searchQuery.isPending)
			)
		}
	}
}
