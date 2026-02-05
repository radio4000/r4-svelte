import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {NonRetriableError} from '@tanstack/offline-transactions'
import {sdk} from '@radio4000/sdk'
import type {PendingMutation} from '@tanstack/db'
import {parseUrl} from 'media-now'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {channelsCollection, type Channel} from './channels'
import {trackMetaCollection, type TrackMeta} from './track-meta'
import {log, txLog, getErrorMessage} from './utils'
import {getOfflineExecutor} from './offline-executor'
import type {Track} from '$lib/types'

export const tracksCollection = createCollection<Track, string>(
	queryCollectionOptions({
		queryKey: (opts) => {
			const options = parseLoadSubsetOptions(opts)
			const slugEq = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			const slugIn = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'in')?.value
			if (slugIn) return ['tracks', ...slugIn.sort()]
			if (slugEq) return ['tracks', slugEq]
			return ['tracks']
		},
		syncMode: 'on-demand',
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async (ctx) => {
			const options = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)
			const slugEq = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			const slugIn = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'in')?.value
			const slugs = slugIn ?? (slugEq ? [slugEq] : [])
			const createdAfter = options.filters.find((f) => f.field[0] === 'created_at' && f.operator === 'gt')?.value
			if (!slugs.length) return []
			const results = await Promise.all(
				slugs.map((s: string) => fetchTracksBySlug(s, {limit: options.limit, createdAfter}))
			)
			return results.flat()
		}
	})
)

async function fetchTracksBySlug(slug: string, opts?: {limit?: number; createdAfter?: string}): Promise<Track[]> {
	const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === slug)

	if (channel?.source === 'v1') {
		log.info('tracks fetch v1', {slug})
		const {data, error} = await sdk.firebase.readTracks({slug})
		if (error) throw error
		return (data || []).map((t) => sdk.firebase.parseTrack(t, channel.id, slug))
	}

	log.info('tracks fetch v2', {slug, limit: opts?.limit, createdAfter: opts?.createdAfter})
	let query = sdk.supabase.from('channel_tracks').select('*').eq('slug', slug).order('created_at', {ascending: false})
	if (opts?.limit) query = query.limit(opts.limit)
	if (opts?.createdAfter) query = query.gt('created_at', opts.createdAfter)

	const {data, error} = await query
	if (error) throw error

	// Fallback to v1 if v2 returns empty (race condition: channel not loaded yet)
	if (!data?.length) {
		const {data: v1Data, error: v1Error} = await sdk.firebase.readTracks({slug})
		if (v1Error) throw v1Error
		if (v1Data?.length) {
			const ch = [...channelsCollection.state.values()].find((c) => c.slug === slug)
			const channelId = ch?.id || slug
			return v1Data.map((t) => sdk.firebase.parseTrack(t, channelId, slug))
		}
	}

	return (data || []) as Track[]
}

async function handleTrackInsert(mutation: PendingMutation, metadata: Record<string, unknown>): Promise<void> {
	const track = mutation.modified as {id: string; url: string; title: string}
	const channelId = metadata?.channelId as string
	if (!channelId) throw new NonRetriableError('channelId required in transaction metadata')
	log.info('insert_start', {clientId: track.id, title: track.title, channelId})
	const {data, error} = await sdk.tracks.createTrack(channelId, track)
	log.info('insert_done', {clientId: track.id, serverId: data?.id, match: track.id === data?.id, error})
	if (error) throw new NonRetriableError(getErrorMessage(error))
}

async function handleTrackUpdate(mutation: PendingMutation): Promise<void> {
	const track = mutation.modified as {id: string}
	const changes = mutation.changes as Record<string, unknown>
	log.info('update_start', {id: track.id, changes})
	const response = await sdk.tracks.updateTrack(track.id, changes)
	log.info('update_done', {id: track.id, error: response.error})
	if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
}

async function handleTrackDelete(mutation: PendingMutation): Promise<void> {
	const track = mutation.original as {id: string}
	log.info('delete_start', {id: track.id})
	const response = await sdk.tracks.deleteTrack(track.id)
	log.info('delete_done', {id: track.id, error: response.error})
	if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
}

export const tracksAPI = {
	async syncTracks({
		transaction,
		idempotencyKey
	}: {
		transaction: {mutations: Array<PendingMutation>; metadata?: Record<string, unknown>}
		idempotencyKey: string
	}) {
		const slug = transaction.metadata?.slug as string
		const metadata = transaction.metadata || {}
		let needsInvalidation = false

		for (const mutation of transaction.mutations) {
			txLog.info('tracks', {type: mutation.type, slug, key: idempotencyKey.slice(0, 8)})
			if (mutation.type === 'insert') {
				await handleTrackInsert(mutation, metadata)
				needsInvalidation = true
			} else if (mutation.type === 'update') {
				await handleTrackUpdate(mutation)
				// Updates don't need invalidation - optimistic data is authoritative
			} else if (mutation.type === 'delete') {
				await handleTrackDelete(mutation)
				needsInvalidation = true
			} else {
				txLog.warn('tracks unhandled type', {type: mutation.type})
			}
		}
		log.info('tx_complete', {idempotencyKey: idempotencyKey.slice(0, 8), slug})

		if (slug && needsInvalidation) {
			log.info('invalidate', {slug})
			await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
		}
	}
}

export function getTrackWithMeta(track: Track): Track & Partial<Omit<TrackMeta, 'media_id'>> {
	if (!track.media_id) return track
	const meta = trackMetaCollection.get(track.media_id)
	if (!meta) return track
	return {...track, ...meta}
}

export function addTrack(
	channel: {id: string; slug: string},
	input: {url: string; title: string; description?: string; discogs_url?: string}
) {
	const parsed = parseUrl(input.url)
	const media_id = parsed?.provider === 'youtube' ? parsed.id : null
	const provider = parsed?.provider || null
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		tracksCollection.insert({
			id: uuid(),
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
		})
	})
	return tx.commit()
}

export async function updateTrack(channel: {id: string; slug: string}, id: string, changes: Record<string, unknown>) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		const track = tracksCollection.get(id)
		if (!track) return
		tracksCollection.update(id, (draft) => {
			Object.assign(draft, changes)
		})
	})
	await tx.commit()
	// Workaround: offline tx commit doesn't update query cache, causing syncedData revert
	const track = tracksCollection.get(id)
	if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
}

export function deleteTrack(channel: {id: string; slug: string}, id: string) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		const track = tracksCollection.get(id)
		if (track) {
			tracksCollection.delete(id)
		}
	})
	return tx.commit()
}

export async function batchUpdateTracksUniform(channel: Channel, ids: string[], changes: Record<string, unknown>) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		for (const id of ids) {
			const track = tracksCollection.get(id)
			if (!track) continue
			tracksCollection.update(id, (draft) => {
				Object.assign(draft, changes)
			})
		}
	})
	await tx.commit()
	// Derived live queries don't react to transaction updates, so manually trigger
	tracksCollection.utils.writeBatch(() => {
		for (const id of ids) {
			const track = tracksCollection.get(id)
			if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
		}
	})
}

export async function batchUpdateTracksIndividual(
	channel: Channel,
	updates: Array<{id: string; changes: Record<string, unknown>}>
) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		for (const {id, changes} of updates) {
			const track = tracksCollection.get(id)
			if (!track) continue
			tracksCollection.update(id, (draft) => {
				Object.assign(draft, changes)
			})
		}
	})
	await tx.commit()
	// Derived live queries don't react to transaction updates, so manually trigger
	tracksCollection.utils.writeBatch(() => {
		for (const {id, changes} of updates) {
			const track = tracksCollection.get(id)
			if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
		}
	})
}

export function batchDeleteTracks(channel: Channel, ids: string[]) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		for (const id of ids) {
			const track = tracksCollection.get(id)
			if (track) {
				tracksCollection.delete(id)
			}
		}
	})
	return tx.commit()
}

export async function checkTracksFreshness(slug: string): Promise<boolean> {
	return queryClient.fetchQuery({
		queryKey: ['tracks-freshness', slug],
		staleTime: 60_000,
		queryFn: async () => {
			const cachedTracks = (queryClient.getQueryData(['tracks', slug]) as Track[]) || []
			const localLatest = cachedTracks.reduce(
				(max: string | null, t: Track) => (!max || (t.updated_at && t.updated_at > max) ? t.updated_at : max),
				null as string | null
			)

			const {data, error} = await sdk.supabase
				.from('channel_tracks')
				.select('updated_at')
				.eq('slug', slug)
				.order('updated_at', {ascending: false})
				.limit(1)

			if (error) {
				log.warn('freshness', {slug, error})
				return false
			}

			const remoteLatest = data?.[0]?.updated_at
			const outdated = remoteLatest && (!localLatest || remoteLatest > localLatest)

			if (outdated) {
				log.info('freshness outdated', {slug, local: localLatest, remote: remoteLatest})
				await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
			}

			return !!outdated
		}
	})
}

/** Fetch tracks globally (no channel filter). Supports tags, order, limit. */
export async function fetchTracksGlobal(opts: {
	tags?: string[]
	tagsMode?: 'any' | 'all'
	order?: string
	direction?: 'asc' | 'desc'
	limit?: number
}): Promise<Track[]> {
	const limit = opts.limit || 50
	const direction = opts.direction || 'desc'
	const column = opts.order === 'name' ? 'title' : opts.order === 'updated' ? 'updated_at' : 'created_at'
	const cacheKey = [
		'tracks-global',
		opts.tags?.sort().join(',') || '',
		opts.tagsMode || 'any',
		column,
		direction,
		limit
	]

	return queryClient.fetchQuery({
		queryKey: cacheKey,
		staleTime: 60_000,
		queryFn: async () => {
			let query = sdk.supabase.from('channel_tracks').select('*')
			if (opts.tags?.length) {
				query = opts.tagsMode === 'all' ? query.contains('tags', opts.tags) : query.overlaps('tags', opts.tags)
			}
			query = query.order(column, {ascending: direction === 'asc'}).limit(limit)
			const {data, error} = await query
			if (error) throw error
			return (data || []) as Track[]
		}
	})
}

export async function ensureTracksLoaded(slug: string): Promise<void> {
	const existing = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
	if (existing.length) return

	const data = await queryClient.fetchQuery<Track[]>({
		queryKey: ['tracks', slug],
		queryFn: () => fetchTracksBySlug(slug)
	})

	tracksCollection.utils.writeBatch(() => {
		for (const track of data) {
			tracksCollection.utils.writeUpsert(track)
		}
	})
}

/**
 * Insert duration from trackMetaCollection to tracks that are missing it
 */
export async function insertDurationFromMeta(channel: Channel, tracks: Track[]): Promise<number> {
	const updates: Array<{id: string; changes: {duration: number}}> = []
	for (const track of tracks) {
		if (track.duration) continue
		if (!track.media_id) continue
		const meta = trackMetaCollection.get(track.media_id)
		if (!meta?.youtube_data?.duration) continue
		updates.push({id: track.id, changes: {duration: meta.youtube_data.duration}})
	}
	if (updates.length) {
		await batchUpdateTracksIndividual(channel, updates)
	}
	return updates.length
}
