import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {capabilities} from '$lib/modes'
import {parseUrl} from 'media-now'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {channelsCollection, type Channel} from './channels'
import {trackMetaCollection, trackMetaKey} from './track-meta'
import {pullYouTube} from '$lib/metadata/youtube'
import {
	titleResets,
	mergeTitleUndo,
	undoableTitles,
	loadTitleUndo,
	saveTitleUndo
} from '$lib/title-reset'
import {logger} from '$lib/logger'
import {getErrorMessage} from './utils'

const log = logger.ns('tracks').seal()
import {searchTracks} from '$lib/search-fts'
import type {ChannelRef, Track, TrackWithMeta} from '$lib/types'

/** Parse provider/media_id from a track's URL, filling in any missing fields. */
export function normalizeTrackMedia<
	T extends {url?: string | null; provider?: string | null; media_id?: string | null}
>(track: T): T {
	const parsed = track.url ? parseUrl(track.url) : null
	return {
		...track,
		provider: track.provider ?? parsed?.provider ?? null,
		media_id: track.media_id ?? parsed?.id ?? null
	}
}

type TrackQueryParams = {
	slugEq?: string
	slugIn?: string[]
	idIn?: string[]
	tagsIn?: string[]
	ftsEq?: string
	createdAfter?: string
	limit?: number
}

function parseTrackParams(opts: Parameters<typeof parseLoadSubsetOptions>[0]): TrackQueryParams {
	const options = parseLoadSubsetOptions(opts)
	return {
		slugEq: options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value as
			| string
			| undefined,
		slugIn: options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'in')?.value as
			| string[]
			| undefined,
		idIn: options.filters.find((f) => f.field[0] === 'id' && f.operator === 'in')?.value as
			| string[]
			| undefined,
		tagsIn: options.filters.find((f) => f.field[0] === 'tags' && f.operator === 'in')?.value as
			| string[]
			| undefined,
		ftsEq: options.filters.find((f) => f.field[0] === 'fts' && f.operator === 'eq')?.value as
			| string
			| undefined,
		createdAfter: options.filters.find((f) => f.field[0] === 'created_at' && f.operator === 'gt')
			?.value as string | undefined,
		limit: options.limit
	}
}

function getTrackQueryKey(params: TrackQueryParams): (string | number)[] {
	if (params.slugIn) {
		const key: (string | number)[] = ['tracks', 'slugs', ...params.slugIn.toSorted()]
		if (params.limit) key.push('limit', params.limit)
		if (params.createdAfter) key.push('after', params.createdAfter)
		return key
	}
	if (params.slugEq) {
		const key: (string | number)[] = ['tracks', params.slugEq]
		if (params.limit) key.push('limit', params.limit)
		if (params.createdAfter) key.push('after', params.createdAfter)
		return key
	}
	if (params.idIn) {
		return ['tracks', 'ids', ...params.idIn.toSorted()]
	}
	if (params.tagsIn) {
		const key: (string | number)[] = ['tracks', 'tags', ...params.tagsIn.toSorted()]
		if (params.limit) key.push('limit', params.limit)
		return key
	}
	if (params.ftsEq) {
		const key: (string | number)[] = ['tracks', 'search', params.ftsEq]
		if (params.limit) key.push('limit', params.limit)
		return key
	}
	return ['tracks']
}

/**
 * On-demand track collection, keyed by id. Fetched by slug (channel), id list (keep-alive
 * pins), tags, or full-text search — see `parseTrackParams`/`getTrackQueryKey`.
 */
export const tracksCollection = createCollection<Track, string>({
	...queryCollectionOptions({
		queryKey: (opts) => getTrackQueryKey(parseTrackParams(opts)),
		syncMode: 'on-demand',
		startSync: true,
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async (ctx): Promise<Track[]> => {
			const params = parseTrackParams(ctx.meta?.loadSubsetOptions)
			const slugs = params.slugIn ?? (params.slugEq ? [params.slugEq] : [])

			log.info('queryFn', {
				slugs,
				tagsIn: params.tagsIn,
				ftsEq: params.ftsEq,
				createdAfter: params.createdAfter
			})

			if (!capabilities.globalBrowse) {
				const all = [...tracksCollection.state.values()]
				if (params.idIn?.length) {
					const set = new Set(params.idIn)
					return all.filter((t) => set.has(t.id))
				}
				if (slugs.length) {
					const set = new Set(slugs)
					return all.filter((t) => !!t.slug && set.has(t.slug))
				}
				if (params.tagsIn?.length)
					return all.filter((t) => t.tags?.some((tag) => params.tagsIn?.includes(tag)))
				if (params.ftsEq) {
					const q = params.ftsEq.toLowerCase()
					return all.filter(
						(t) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
					)
				}
				return all
			}

			// Id-based: keep-alive pins (e.g. a deck's queue). Return rows already in
			// the collection; only fetch ids that aren't loaded yet. This owns those
			// rows so on-demand GC won't evict them while the pin is subscribed.
			if (params.idIn?.length) {
				const idSet = new Set(params.idIn)
				const present = [...tracksCollection.state.values()].filter((t) => idSet.has(t.id))
				const missing = params.idIn.filter((id) => !tracksCollection.state.get(id))
				if (!missing.length) return present
				const fetched = await fetchTracksByIds(missing)
				return [...present, ...fetched]
			}

			// Slug-based: fetch per channel
			if (slugs.length) {
				const results = await Promise.all(
					slugs.map(async (s: string) => {
						const tracks = await fetchTracksBySlug(s, {
							limit: params.limit,
							createdAfter: params.createdAfter
						})
						log.info('queryFn fetched', {slug: s, count: tracks.length})
						// Keep the canonical per-slug cache entry reserved for full channel snapshots.
						// Partial slug fetches (limit/createdAfter) must not overwrite that persisted key.
						if (!params.limit && !params.createdAfter) {
							queryClient.setQueryData(['tracks', s], tracks)
						}
						return tracks
					})
				)
				return results.flat()
			}

			// Global: fetch by tags
			if (params.tagsIn?.length) {
				let query = sdk.supabase.from('channel_tracks').select('*')
				query = query.overlaps('tags', params.tagsIn)
				query = query.order('created_at', {ascending: false}).limit(params.limit || 50)
				const {data, error} = await query
				if (error) throw error
				const tracks = ((data || []) as Track[]).map(normalizeTrackMedia)
				tracksCollection.utils.writeUpsert(tracks)
				return tracks
			}

			// Global: full-text search
			if (params.ftsEq) {
				const {tracks: rawTracks} = await searchTracks(params.ftsEq, {limit: params.limit || 50})
				const tracks = rawTracks.map(normalizeTrackMedia)
				tracksCollection.utils.writeUpsert(tracks)
				return tracks
			}

			return []
		}
	}),
	onInsert: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('onInsert', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const metadata = (m.metadata || {}) as Record<string, unknown>
			const serverTrack = await handleTrackInsert(m.modified, metadata)
			if (serverTrack) {
				// Merge view-only fields (e.g. slug) from the optimistic insert,
				// since createTrack returns from the tracks table, not channel_tracks view.
				const merged = {...m.modified, ...normalizeTrackMedia(serverTrack)}
				log.info('onInsert writeUpsert', {id: merged.id})
				tracksCollection.utils.writeUpsert(merged)
			}
		}
		log.info('onInsert done')
	},
	onUpdate: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('onUpdate', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const serverTrack = await handleTrackUpdate(
				m.modified.id,
				m.changes as Record<string, unknown>
			)
			if (serverTrack) {
				const normalized = normalizeTrackMedia(serverTrack)
				log.info('onUpdate writeUpsert', {id: normalized.id})
				tracksCollection.utils.writeUpsert(normalized)
			}
		}
		log.info('onUpdate done')
	},
	onDelete: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('onDelete', {count: transaction.mutations.length})
		let slug: string | undefined
		for (const m of transaction.mutations) {
			slug ??= (m.metadata as Record<string, unknown>)?.slug as string | undefined
			await handleTrackDelete(m.original.id)
			tracksCollection.utils.writeDelete(m.original.id)
		}
		if (slug) await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
		log.info('onDelete done', {slug})
	}
})

async function fetchTracksBySlug(
	slug: string,
	opts?: {limit?: number; createdAfter?: string}
): Promise<Track[]> {
	log.info('tracks fetch', {slug, limit: opts?.limit, createdAfter: opts?.createdAfter})
	let query = sdk.supabase
		.from('channel_tracks')
		.select('*')
		.eq('slug', slug)
		.order('created_at', {ascending: false})
	if (opts?.limit) query = query.limit(opts.limit)
	if (opts?.createdAfter) query = query.gt('created_at', opts.createdAfter)

	const {data, error} = await query
	if (error) throw error
	return ((data || []) as Track[]).map(normalizeTrackMedia)
}

/** Fetch tracks by id, batched to stay within URL limits. Newest first. */
async function fetchTracksByIds(ids: string[]): Promise<Track[]> {
	if (!ids.length) return []
	const BATCH = 50
	const all: Track[] = []
	for (let i = 0; i < ids.length; i += BATCH) {
		const {data, error} = await sdk.supabase
			.from('channel_tracks')
			.select('*')
			.in('id', ids.slice(i, i + BATCH))
		if (error) throw error
		all.push(...((data || []) as Track[]).map(normalizeTrackMedia))
	}
	return all
}

async function handleTrackInsert(
	track: Track,
	metadata: Record<string, unknown>
): Promise<Track | null> {
	const channelId = metadata?.channelId as string
	if (!channelId) throw new Error('channelId required in transaction metadata')
	log.info('insert_start', {clientId: track.id, title: track.title, channelId})
	const {data, error} = await sdk.tracks.createTrack(channelId, {
		id: track.id,
		url: track.url,
		title: track.title,
		description: track.description || undefined,
		discogs_url: track.discogs_url || undefined
	})
	log.info('insert_done', {
		clientId: track.id,
		serverId: data?.id,
		match: track.id === data?.id,
		error
	})
	if (error) throw new Error(getErrorMessage(error))
	return (data as Track) ?? null
}

async function handleTrackUpdate(
	id: string,
	changes: Record<string, unknown>
): Promise<Track | null> {
	log.info('update_start', {id, changes})
	const response = await sdk.tracks.updateTrack(id, changes)
	log.info('update_done', {id, error: response.error})
	if (response.error) throw new Error(getErrorMessage(response.error))
	return (response.data as Track) ?? null
}

async function handleTrackDelete(id: string): Promise<void> {
	log.info('delete_start', {id})
	const response = await sdk.tracks.deleteTrack(id)
	log.info('delete_done', {id, error: response.error})
	if (response.error) throw new Error(getErrorMessage(response.error))
}

/** Merge cached enrichment (duration, artwork, etc.) from trackMetaCollection onto a track. */
export function getTrackWithMeta(track: Track): TrackWithMeta {
	if (!track.media_id) return track
	const provider = track.provider ?? null
	const meta =
		trackMetaCollection.get(trackMetaKey(provider, track.media_id)) ??
		trackMetaCollection.get(trackMetaKey(null, track.media_id))
	if (!meta) return track
	return {...track, ...meta}
}

/** Add a track to a channel; returns the new track's id once persisted. */
export function addTrack(
	channel: ChannelRef,
	input: {url: string; title: string; description?: string; discogs_url?: string}
) {
	const parsed = parseUrl(input.url)
	const provider = parsed?.provider ?? null
	const media_id = parsed?.id ?? null
	const id = uuid()
	return tracksCollection
		.insert(
			{
				id,
				url: input.url,
				title: input.title,
				description: input.description || '',
				slug: channel.slug,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				discogs_url: input.discogs_url || null,
				duration: null,
				fts: null,
				mentions: null,
				playback_error: null,
				tags: null,
				media_id,
				provider
			},
			{metadata: {channelId: channel.id, slug: channel.slug}}
		)
		.isPersisted.promise.then(() => id)
}

/** Update a track's fields, re-deriving provider/media_id if the url changed. */
export function updateTrack(channel: ChannelRef, id: string, changes: Record<string, unknown>) {
	const parsed = typeof changes.url === 'string' ? parseUrl(changes.url) : null
	return tracksCollection
		.update(id, {metadata: {slug: channel.slug}}, (draft) => {
			Object.assign(draft, changes)
			if (parsed) {
				draft.provider = parsed?.provider ?? null
				draft.media_id = parsed?.id ?? null
			}
		})
		.isPersisted.promise.then(() => {})
}

export function deleteTrack(channel: ChannelRef, id: string) {
	return tracksCollection
		.delete(id, {metadata: {slug: channel.slug}})
		.isPersisted.promise.then(() => {})
}

/** Apply the same field changes to multiple tracks (e.g. bulk-tagging in batch-edit). */
export function batchUpdateTracksUniform(
	channel: Channel,
	ids: string[],
	changes: Record<string, unknown>
) {
	const parsed = typeof changes.url === 'string' ? parseUrl(changes.url) : null
	return tracksCollection
		.update(ids, {metadata: {slug: channel.slug}}, (drafts) => {
			for (const draft of drafts as Array<Track>) {
				Object.assign(draft, changes)
				if (parsed) {
					draft.provider = parsed?.provider ?? null
					draft.media_id = parsed?.id ?? null
				}
			}
		})
		.isPersisted.promise.then(() => {})
}

/** Apply per-track field changes in one transaction (each id gets its own `changes`). */
export function batchUpdateTracksIndividual(
	channel: Channel,
	updates: Array<{id: string; changes: Record<string, unknown>}>
) {
	return tracksCollection
		.update(
			updates.map((u) => u.id),
			{metadata: {slug: channel.slug}},
			(drafts) => {
				for (const draft of drafts as Array<Track>) {
					const update = updates.find((u) => u.id === draft.id)
					if (!update) continue
					Object.assign(draft, update.changes)
					if (typeof update.changes.url === 'string') {
						const parsed = parseUrl(update.changes.url)
						draft.provider = parsed?.provider ?? null
						draft.media_id = parsed?.id ?? null
					}
				}
			}
		)
		.isPersisted.promise.then(() => {})
}

export function batchDeleteTracks(channel: Channel, ids: string[]) {
	return tracksCollection
		.delete(ids, {metadata: {slug: channel.slug}})
		.isPersisted.promise.then(() => {})
}

/** Compare cached tracks for `slug` against remote (count + latest updated_at); invalidates and returns whether stale. */
export async function checkTracksFreshness(slug: string): Promise<boolean> {
	return queryClient.fetchQuery({
		queryKey: ['tracks-freshness', slug],
		staleTime: 60_000,
		queryFn: async () => {
			const cachedTracks = (queryClient.getQueryData(['tracks', slug]) as Track[]) || []
			const localLatest = cachedTracks.reduce(
				(max: string | null, t: Track | null | undefined) => {
					const updated = t?.updated_at
					if (!updated) return max
					return !max || updated > max ? updated : max
				},
				null as string | null
			)

			const {data, error, count} = await sdk.supabase
				.from('channel_tracks')
				.select('updated_at', {count: 'exact', head: false})
				.eq('slug', slug)
				.order('updated_at', {ascending: false})
				.limit(1)

			if (error) {
				log.warn('freshness', {slug, error})
				return false
			}

			const remoteLatest = data?.[0]?.updated_at
			const remoteCount = count ?? 0

			// Remote has no tracks for this slug — treat as local-only (imported backup).
			// Don't invalidate or we'd wipe data that only exists locally.
			if (remoteCount === 0 && cachedTracks.length > 0) {
				log.info('freshness skip local-only', {slug, cached: cachedTracks.length})
				return false
			}

			const countMismatch = remoteCount !== cachedTracks.length
			const outdated =
				countMismatch || (remoteLatest && (!localLatest || remoteLatest > localLatest))

			log.debug('freshness', {
				slug,
				cached: cachedTracks.length,
				remote: remoteCount,
				localLatest,
				remoteLatest,
				outdated: !!outdated
			})

			if (outdated) {
				await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
				log.info('freshness invalidated', {slug})
			}

			return !!outdated
		}
	})
}

/**
 * Fetch tracks created after `createdAfter` for multiple channel slugs in one query.
 * Results are upserted into tracksCollection and returned (newest first).
 * Batches slugs to stay within URL limits.
 */
export async function fetchRecentTracksForSlugs(
	slugs: string[],
	createdAfter: string
): Promise<Track[]> {
	if (!slugs.length) return []
	if (!tracksCollection.isReady()) tracksCollection.startSyncImmediate()
	const BATCH = 50
	const all: Track[] = []
	for (let i = 0; i < slugs.length; i += BATCH) {
		const batch = slugs.slice(i, i + BATCH)
		const {data, error} = await sdk.supabase
			.from('channel_tracks')
			.select('*')
			.in('slug', batch)
			.gt('created_at', createdAfter)
			.order('created_at', {ascending: false})
		if (error) throw error
		const tracks = ((data || []) as Track[]).map(normalizeTrackMedia)
		tracksCollection.utils.writeUpsert(tracks)
		all.push(...tracks)
	}
	return all.toSorted((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

/**
 * Fetch the most recently added tracks globally, ordered by created_at DESC.
 * Results are upserted into tracksCollection.
 */
export async function fetchRecentTracks({
	limit = 50,
	offset = 0
}: {
	limit?: number
	offset?: number
} = {}): Promise<Track[]> {
	if (!tracksCollection.isReady()) tracksCollection.startSyncImmediate()
	const {data, error} = await sdk.supabase
		.from('channel_tracks')
		.select('*')
		.order('created_at', {ascending: false})
		.range(offset, offset + limit - 1)
	if (error) throw error
	const tracks = ((data || []) as Track[]).map(normalizeTrackMedia)
	tracksCollection.utils.writeUpsert(tracks)
	return tracks
}

/** Load a channel's tracks into the collection if fewer than `track_count` are cached. */
export async function ensureTracksLoaded(slug: string): Promise<void> {
	const existing = [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
	if (existing.length) {
		const channel = [...channelsCollection.state.values()].find((c) => c?.slug === slug)
		if (!channel || existing.length >= (channel.track_count ?? 0)) return
	}

	const data = await queryClient.fetchQuery<Track[]>({
		queryKey: ['tracks', slug],
		queryFn: () => fetchTracksBySlug(slug),
		staleTime: 0
	})

	// Ensure sync is started so write utils are available
	if (!tracksCollection.isReady()) {
		tracksCollection.startSyncImmediate()
	}

	log.debug('ensureTracksLoaded', slug, data.length)
	tracksCollection.utils.writeUpsert(data)
}

/**
 * Insert duration from trackMetaCollection to tracks that are missing it
 */
export async function insertDurationFromMeta(channel: Channel, tracks: Track[]): Promise<number> {
	const updates: Array<{id: string; changes: {duration: number}}> = []
	for (const track of tracks) {
		if (track.duration) continue
		if (!track.media_id) continue
		const provider = track.provider ?? null
		const meta =
			trackMetaCollection.get(trackMetaKey(provider, track.media_id)) ??
			trackMetaCollection.get(trackMetaKey(null, track.media_id))
		if (!meta?.youtube_data?.duration) continue
		updates.push({id: track.id, changes: {duration: meta.youtube_data.duration}})
	}
	if (updates.length) {
		await batchUpdateTracksIndividual(channel, updates)
	}
	return updates.length
}

/** Write per-track changes 50 at a time, so a big batch shows progress and a failure only rolls back its own chunk. */
async function updateInChunks(
	channel: Channel,
	updates: Array<{id: string; changes: Record<string, unknown>}>,
	onProgress?: (done: number, total: number) => void
) {
	for (let i = 0; i < updates.length; i += 50) {
		await batchUpdateTracksIndividual(channel, updates.slice(i, i + 50))
		onProgress?.(Math.min(i + 50, updates.length), updates.length)
	}
}

/**
 * Overwrite track titles with their YouTube video titles, fetching missing metadata first.
 * The previous titles are saved for `undoTitleReset`. Returns how many titles changed.
 * If fetching fails, tracks with cached titles are still reset, then the fetch error is thrown.
 */
export async function resetTitlesFromVideo(
	channel: Channel,
	tracks: Track[],
	onProgress?: (done: number, total: number) => void
): Promise<number> {
	const youtube = tracks.filter((t) => t.provider === 'youtube' && t.media_id)
	let fetchError: unknown
	try {
		await pullYouTube(youtube.map((t) => ({provider: 'youtube', mediaId: t.media_id as string})))
	} catch (err) {
		fetchError = err
	}
	const changes = titleResets(youtube.map(getTrackWithMeta))
	if (changes.length) {
		saveTitleUndo(channel.slug, mergeTitleUndo(loadTitleUndo(channel.slug), changes))
		await updateInChunks(
			channel,
			changes.map(({id, title}) => ({id, changes: {title}})),
			onProgress
		)
	}
	if (fetchError) throw fetchError
	return changes.length
}

/**
 * Restore the titles replaced by `resetTitlesFromVideo` on this channel.
 * Tracks edited since the reset are left alone, and their undo is dropped.
 */
export async function undoTitleReset(
	channel: Channel,
	onProgress?: (done: number, total: number) => void
): Promise<number> {
	const changes = undoableTitles(
		loadTitleUndo(channel.slug),
		(id) => tracksCollection.get(id)?.title
	)
	await updateInChunks(
		channel,
		changes.map(({id, previous}) => ({id, changes: {title: previous}})),
		onProgress
	)
	saveTitleUndo(channel.slug, [])
	return changes.length
}
