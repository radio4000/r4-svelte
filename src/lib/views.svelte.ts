import {fuzzySearch} from '$lib/search'
import {shuffleArray} from '$lib/utils'
import {createQuery} from '@tanstack/svelte-query'
import {useLiveQuery} from '@tanstack/svelte-db'
import {inArray} from '@tanstack/db'
import {tracksCollection} from '$lib/collections/tracks'
import {channelsCollection} from '$lib/collections/channels'
import {searchTracks} from '$lib/search-fts'
import {sdk} from '@radio4000/sdk'
import type {Channel, Deck, Track} from '$lib/types'
import {viewURI, type View} from '$lib/views'

/** Auto-radio decks matching a specific View identity. */
export function getAutoDecksForView(decks: Deck[], view?: View): Deck[] {
	const key = viewURI(view)
	return decks.filter((d) => d.auto_radio && viewURI(d.view) === key)
}

/** Post-process raw tracks according to a View: tag filtering, fuzzy search, sort/shuffle, limit. */
export function processViewTracks(tracks: Track[], view: View): Track[] {
	let data = tracks
	const q = view.queries[0]
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
	if (view.limit) data = data.slice(0, view.limit)
	return data
}

/** Reactive view query. Call during component init. Returns {tracks, channels, loading} with getters. */
export function queryView(getView: () => View) {
	// Stable $derived primitives — only change when actual query params change.
	// Prevents re-creating queries on sort/direction/limit changes (same pattern as [slug]/+layout).
	const channelsKey = $derived(getView().queries[0]?.channels?.join(',') || '')
	const tagsKey = $derived(getView().queries[0]?.tags?.toSorted().join(',') || '')
	const searchKey = $derived(getView().queries[0]?.search?.trim() || '')

	const channelsQuery = useLiveQuery((q) => {
		const slugs = channelsKey ? channelsKey.split(',') : []
		if (!slugs.length) return q.from({c: channelsCollection}).where(({c}) => inArray(c.id, ['']))
		return q.from({c: channelsCollection}).where(({c}) => inArray(c.slug, slugs))
	})

	const tracksQuery = useLiveQuery((q) => {
		const slugs = channelsKey ? channelsKey.split(',') : []
		if (!slugs.length) return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, ['']))
		return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.slug, slugs))
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
				const tracks = (await searchTracks(search, {limit: 100})) as Track[]
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
				? ((tracksQuery.data ?? []) as Track[])
				: tagsKey
					? ((tagsQuery.data ?? []) as Track[])
					: searchKey
						? ((searchQuery.data ?? []) as Track[])
						: []
			return processViewTracks(data, v)
		},
		get channels() {
			return (channelsQuery.data ?? []) as Channel[]
		},
		get loading() {
			return (
				(!!channelsKey && !tracksQuery.isReady) ||
				(!!tagsKey && !channelsKey && tagsQuery.isPending) ||
				(!!searchKey && !channelsKey && !tagsKey && searchQuery.isPending)
			)
		}
	}
}
