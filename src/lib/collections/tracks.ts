import {createCollection} from '@tanstack/svelte-db'
import {untrack} from 'svelte'
import {createSubscriber} from 'svelte/reactivity'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {BasicIndex} from '@tanstack/db'
import type {QueryKey} from '@tanstack/query-core'
import {sdk} from '@radio4000/sdk'
import {capabilities} from '#lib/modes.js'
import {parseUrl} from 'media-now'
import {uuid} from '#lib/utils.js'
import {queryClient} from './query-client'
import {channelsCollection, type Channel} from './channels'
import {trackMetaCollection, trackMetaKey} from './track-meta'
import {logger} from '#lib/logger.js'
import {getErrorMessage} from './utils'

const log = logger.ns('tracks').seal()
import type {ChannelRef, Track, TrackWithMeta} from '#lib/types.js'

/** Parse provider/media_id from a track's URL, filling in any missing fields. */
export function normalizeTrackMedia<
	T extends {url?: string | null; provider?: string | null; media_id?: string | null}
>(track: T): T {
	// Rows almost always arrive with both set; parsing 2.6k URLs anyway cost ~35ms per channel.
	if (track.provider && track.media_id) return track
	const parsed = track.url ? parseUrl(track.url) : null
	return {
		...track,
		provider: track.provider ?? parsed?.provider ?? null,
		media_id: track.media_id ?? parsed?.id ?? null
	}
}

type LoadSubsetOptions = Parameters<typeof parseLoadSubsetOptions>[0] & {offset?: number}

/**
 * What a track subset asks the server for. Exactly what `getTrackQueryKey` encodes and
 * the queryFn fetches, so one key always means one answer.
 */
type TrackQueryParams = {
	/** One slug is a channel and shares the channel's `['tracks', slug]` key. */
	slugs?: string[]
	ids?: string[]
	mediaId?: string
	/** DB's tie check at a page boundary: the rows sharing the last row's created_at. */
	createdAt?: string
	createdAfter?: string
	limit?: number
	offset?: number
}

/**
 * Read the filters, order and window a live query pushes down. A window (limit/offset)
 * is only kept when the server can serve it as asked: newest first and no filter we
 * don't fetch by. Otherwise we fetch the whole matching set, a superset the live query
 * narrows locally.
 */
function parseTrackParams(opts: LoadSubsetOptions): TrackQueryParams {
	const {filters, sorts, limit} = parseLoadSubsetOptions(opts)
	const params: TrackQueryParams = {}
	let understood = true
	for (const {field, operator, value} of filters) {
		const name = field.join('.')
		if (name === 'slug' && operator === 'eq') params.slugs = [value as string]
		else if (name === 'slug' && operator === 'in') params.slugs = value as string[]
		else if (name === 'id' && operator === 'eq') params.ids = [value as string]
		else if (name === 'id' && operator === 'in') params.ids = value as string[]
		else if (name === 'media_id' && operator === 'eq') params.mediaId = value as string
		else if (name === 'created_at' && operator === 'eq') params.createdAt = value as string
		else if (name === 'created_at' && operator === 'gt') params.createdAfter = value as string
		else understood = false
	}
	const newestFirst =
		sorts.length === 0 ||
		(sorts.length === 1 &&
			sorts[0].field.join('.') === 'created_at' &&
			sorts[0].direction === 'desc')
	if (understood && newestFirst) {
		if (limit) params.limit = limit
		if (opts?.offset) params.offset = opts.offset
	}
	return params
}

/** Query key for a subset. Ids win over media_id over slugs, the same precedence as the queryFn. */
function getTrackQueryKey(params: TrackQueryParams): (string | number)[] {
	if (params.ids) return ['tracks', 'ids', ...params.ids.toSorted()]
	if (params.mediaId !== undefined) return ['tracks', 'media', params.mediaId]
	if (!params.slugs?.length) return ['tracks']
	const key: (string | number)[] =
		params.slugs.length === 1
			? ['tracks', params.slugs[0]]
			: ['tracks', 'slugs', ...params.slugs.toSorted()]
	if (params.limit) key.push('limit', params.limit)
	if (params.offset) key.push('offset', params.offset)
	if (params.createdAt) key.push('at', params.createdAt)
	if (params.createdAfter) key.push('after', params.createdAfter)
	return key
}

/**
 * On-demand track collection, keyed by id. Fetched by slug (a channel, all of it unless a
 * window is asked for), by id (one track or a keep-alive pin) or by media_id; see
 * `parseTrackParams`/`getTrackQueryKey`. Searches across channels go through
 * sdk.search.searchTracks in queryView, which writes its results in here.
 */
export const tracksCollection = createCollection<Track, string>({
	...queryCollectionOptions<Track, unknown, QueryKey, string>({
		autoIndex: 'eager',
		defaultIndexType: BasicIndex,
		queryKey: (opts) => getTrackQueryKey(parseTrackParams(opts)),
		syncMode: 'on-demand',
		startSync: true,
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async (ctx): Promise<Track[]> => {
			const params = parseTrackParams(ctx.meta?.loadSubsetOptions as LoadSubsetOptions)
			const slugs = params.slugs ?? []

			log.info('queryFn', {slugs, createdAfter: params.createdAfter})

			if (!capabilities.globalBrowse) {
				const all = [...tracksCollection.state.values()]
				if (params.ids?.length) {
					const set = new Set(params.ids)
					return all.filter((t) => set.has(t.id))
				}
				if (params.mediaId !== undefined) return all.filter((t) => t.media_id === params.mediaId)
				if (slugs.length) {
					const set = new Set(slugs)
					return all.filter((t) => !!t.slug && set.has(t.slug))
				}
				return all
			}

			// Id-based: keep-alive pins (e.g. a deck's queue) and single-track readers. Return
			// rows already in the collection; only fetch ids that aren't loaded yet. This owns
			// those rows so on-demand GC won't evict them while the pin is subscribed.
			if (params.ids?.length) {
				const idSet = new Set(params.ids)
				const present = [...tracksCollection.state.values()].filter((t) => idSet.has(t.id))
				const missing = params.ids.filter((id) => !tracksCollection.state.get(id))
				if (!missing.length) return present
				const fetched = await fetchTracksByIds(missing, ctx.signal)
				return [...present, ...fetched]
			}

			// The same media across channels (a track's related tab)
			if (params.mediaId !== undefined) {
				if (!params.mediaId) return []
				const {data, error} = await sdk.supabase
					.from('channel_tracks')
					.select('*')
					.eq('media_id', params.mediaId)
					.abortSignal(ctx.signal)
				if (error) throw error
				return ((data || []) as Track[]).map(normalizeTrackMedia)
			}

			// Slug-based: fetch per channel
			if (slugs.length) {
				const results = await Promise.all(
					slugs.map(async (s: string) => {
						const tracks = await fetchTracksBySlug(s, {
							limit: params.limit,
							offset: params.offset,
							createdAt: params.createdAt,
							createdAfter: params.createdAfter,
							signal: ctx.signal
						})
						log.info('queryFn fetched', {slug: s, count: tracks.length})
						// A full load of several channels also fills each channel's own key, so a
						// later `eq(slug)` query hits it. One slug already is that key.
						const full =
							!params.limit && !params.offset && !params.createdAt && !params.createdAfter
						if (full && slugs.length > 1) queryClient.setQueryData(['tracks', s], tracks)
						return tracks
					})
				)
				return results.flat()
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

/**
 * Rows per request. Matches PostgREST `max_rows` (supabase/config.toml); a shorter page
 * means the end. Channels over it (mrvinyl-r4 has ~4.9k) take several requests.
 */
const SLUG_PAGE = 4000

/** A channel's tracks, newest first: all of them, or the `limit`/`offset` window. */
async function fetchTracksBySlug(
	slug: string,
	opts: {
		limit?: number
		offset?: number
		createdAt?: string
		createdAfter?: string
		signal?: AbortSignal
	} = {}
): Promise<Track[]> {
	const {limit = Infinity, offset = 0, createdAt, createdAfter, signal} = opts
	log.info('tracks fetch', {slug, limit: opts.limit, offset, createdAt, createdAfter})
	const rows: Track[] = []
	while (rows.length < limit) {
		const size = Math.min(SLUG_PAGE, limit - rows.length)
		const from = offset + rows.length
		let query = sdk.supabase
			.from('channel_tracks')
			.select('*')
			.eq('slug', slug)
			.order('created_at', {ascending: false})
			// Tracks imported together share created_at; a second key keeps pages from overlapping.
			.order('id', {ascending: true})
		if (createdAt) query = query.eq('created_at', createdAt)
		if (createdAfter) query = query.gt('created_at', createdAfter)
		query = query.range(from, from + size - 1)
		if (signal) query = query.abortSignal(signal)
		const {data, error} = await query
		if (error) throw error
		const page = (data || []) as Track[]
		rows.push(...page)
		if (page.length < size) break
	}
	return rows.map(normalizeTrackMedia)
}

/** Fetch tracks by id, batched to stay within URL limits. Newest first. */
async function fetchTracksByIds(ids: string[], signal?: AbortSignal): Promise<Track[]> {
	if (!ids.length) return []
	const BATCH = 50
	const all: Track[] = []
	for (let i = 0; i < ids.length; i += BATCH) {
		let query = sdk.supabase
			.from('channel_tracks')
			.select('*')
			.in('id', ids.slice(i, i + BATCH))
		if (signal) query = query.abortSignal(signal)
		const {data, error} = await query
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

/**
 * Read inside a $derived or $effect to re-run it on any track change, then read rows
 * via `tracksCollection.get(id)` or one hoisted `.state`. One subscription shared by
 * every reader, held while any is mounted. useLiveQuery(tracksCollection) does the same
 * but copies every row into each reader's state on each change.
 */
export const watchTracks = createSubscriber((update) => {
	// untrack: changes can land while a $derived evaluates (state_unsafe_mutation)
	const subscription = tracksCollection.subscribeChanges(() => untrack(update))
	return () => subscription.unsubscribe()
})

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
		.when('settled')
		.then(() => id)
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
		.when('settled')
		.then(() => {})
}

/** Delete a track from a channel. */
export function deleteTrack(channel: ChannelRef, id: string) {
	return tracksCollection
		.delete(id, {metadata: {slug: channel.slug}})
		.when('settled')
		.then(() => {})
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
		.when('settled')
		.then(() => {})
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
		.when('settled')
		.then(() => {})
}

/** Delete several tracks of a channel in one transaction. */
export function batchDeleteTracks(channel: Channel, ids: string[]) {
	return tracksCollection
		.delete(ids, {metadata: {slug: channel.slug}})
		.when('settled')
		.then(() => {})
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
	const channel = [...channelsCollection.state.values()].find((c) => c?.slug === slug)
	if (existing.length && channel && existing.length >= (channel.track_count ?? 0)) return

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
