import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {NonRetriableError} from '@tanstack/offline-transactions'
import {sdk} from '@radio4000/sdk'
import type {PendingMutation} from '@tanstack/db'
import {extractYouTubeId} from '$lib/utils'
import {queryClient} from './query-client'
import {channelsCollection, type Channel} from './channels'
import {trackMetaCollection, type TrackMeta} from './track-meta'
import {log, txLog, completedIdempotencyKeys, getErrorMessage} from './utils'
import {getOfflineExecutor} from './offline-executor'
import type {Track} from '$lib/types'

// Tracks collection - NO mutation hooks, mutations go through offline actions
export const tracksCollection = createCollection<Track, string>(
	queryCollectionOptions({
		queryKey: (opts) => {
			const options = parseLoadSubsetOptions(opts)
			const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			const key = slug ? ['tracks', slug] : ['tracks']
			return key
		},
		syncMode: 'on-demand',
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000, // 24h - freshness check triggers invalidation when remote has newer
		queryFn: async (ctx) => {
			const options = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)
			// log.debug('tracks queryFn', {filters: options.filters, limit: options.limit})
			const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			const createdAfter = options.filters.find((f) => f.field[0] === 'created_at' && f.operator === 'gt')?.value

			if (!slug) return []

			// Lookup channel to route by source
			const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === slug)

			if (channel?.source === 'v1') {
				log.info('tracks fetch v1', {slug})
				const {data, error} = await sdk.firebase.readTracks({slug})
				if (error) throw error
				return (data || []).map((t) => sdk.firebase.parseTrack(t, channel.id, slug))
			}

			// V2: use Supabase
			log.info('tracks fetch v2', {slug, limit: options.limit, createdAfter})
			let query = sdk.supabase
				.from('channel_tracks')
				.select('*')
				.eq('slug', slug)
				.order('created_at', {ascending: false})
			if (options.limit) query = query.limit(options.limit)
			if (createdAfter) query = query.gt('created_at', createdAfter)

			const {data, error} = await query
			if (error) throw error

			// Fallback to v1 if v2 returns empty (race condition: channel not loaded yet)
			if (!data?.length) {
				const {data: v1Data, error: v1Error} = await sdk.firebase.readTracks({slug})
				if (v1Error) throw v1Error
				if (v1Data?.length) {
					// Need channel id for parsing - look it up or generate deterministic one
					const ch = [...channelsCollection.state.values()].find((c) => c.slug === slug)
					const channelId = ch?.id || slug
					return v1Data.map((t) => sdk.firebase.parseTrack(t, channelId, slug))
				}
			}

			return data || []
		}
	})
)

type MutationHandler = (mutation: PendingMutation, metadata: Record<string, unknown>) => Promise<void>

const mutationHandlers: Record<string, MutationHandler> = {
	insert: async (mutation, metadata) => {
		const track = mutation.modified as {id: string; url: string; title: string}
		const channelId = metadata?.channelId as string
		if (!channelId) throw new NonRetriableError('channelId required in transaction metadata')
		log.info('insert_start', {clientId: track.id, title: track.title, channelId})
		try {
			const {data, error} = await sdk.tracks.createTrack(channelId, track)
			log.info('insert_done', {clientId: track.id, serverId: data?.id, match: track.id === data?.id, error})
			if (error) throw new NonRetriableError(getErrorMessage(error))
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	},
	update: async (mutation) => {
		const track = mutation.modified as {id: string}
		const changes = mutation.changes as Record<string, unknown>
		log.info('update_start', {id: track.id, title: changes.title})
		try {
			const response = await sdk.tracks.updateTrack(track.id, changes)
			log.info('update_done', {
				id: track.id,
				rowsAffected: response.data?.length,
				status: response.status,
				error: response.error
			})
			if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	},
	delete: async (mutation) => {
		const track = mutation.original as {id: string}
		log.info('delete_start', {id: track.id})
		try {
			const response = await sdk.tracks.deleteTrack(track.id)
			log.info('delete_done', {id: track.id, status: response.status, error: response.error})
			if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	}
}

export const tracksAPI = {
	async syncTracks({
		transaction,
		idempotencyKey
	}: {
		transaction: {mutations: Array<PendingMutation>; metadata?: Record<string, unknown>}
		idempotencyKey: string
	}) {
		if (completedIdempotencyKeys.has(idempotencyKey)) {
			txLog.info('tracks skip duplicate', {key: idempotencyKey.slice(0, 8)})
			return
		}

		const slug = transaction.metadata?.slug as string
		for (const mutation of transaction.mutations) {
			txLog.info('tracks', {type: mutation.type, slug, key: idempotencyKey.slice(0, 8)})
			const handler = mutationHandlers[mutation.type]
			if (handler) {
				await handler(mutation, transaction.metadata || {})
			} else {
				txLog.warn('tracks unhandled type', {type: mutation.type})
			}
		}
		// Mark as completed only after all mutations succeeded
		completedIdempotencyKeys.add(idempotencyKey)
		log.info('tx_complete', {idempotencyKey: idempotencyKey.slice(0, 8), slug})

		// Invalidate to sync state after all mutations
		if (slug) {
			log.info('invalidate', {slug})
			await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
		}
	}
}

export function getTrackWithMeta<T extends {url?: string}>(track: T): T & Partial<TrackMeta> {
	const ytid = extractYouTubeId(track.url)
	if (!ytid) return track
	const meta = trackMetaCollection.get(ytid)
	if (!meta) return track
	return {...track, ...meta}
}

// Track actions
export function addTrack(channel: Channel, input: {url: string; title: string; description?: string}) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		tracksCollection.insert({
			id: crypto.randomUUID(),
			url: input.url,
			title: input.title,
			description: input.description || '',
			slug: channel.slug,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			discogs_url: null,
			duration: null,
			fts: null,
			mentions: null,
			playback_error: null,
			tags: null
		})
	})
	return tx.commit()
}

export function updateTrack(channel: {id: string; slug: string}, id: string, changes: Record<string, unknown>) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncTracks',
		metadata: {channelId: channel.id, slug: channel.slug},
		autoCommit: false
	})
	tx.mutate(() => {
		const track = tracksCollection.get(id)
		if (!track) return
		tracksCollection.update(id, (draft) => {
			Object.assign(draft, changes, {updated_at: new Date().toISOString()})
		})
	})
	return tx.commit()
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

export function batchUpdateTracks(channel: Channel, ids: string[], changes: Record<string, unknown>) {
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
				Object.assign(draft, changes, {updated_at: new Date().toISOString()})
			})
		}
	})
	return tx.commit()
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

/** Check if remote has newer tracks than local. Invalidates cache if so. */
export async function checkTracksFreshness(slug: string): Promise<boolean> {
	const localTracks = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
	const localLatest = localTracks.reduce(
		(max, t) => (!max || t.created_at > max ? t.created_at : max),
		null as string | null
	)

	const {data, error} = await sdk.supabase
		.from('channel_tracks')
		.select('created_at')
		.eq('slug', slug)
		.order('created_at', {ascending: false})
		.limit(1)

	if (error) {
		log.warn('freshness', {slug, error})
		return false
	}

	const remoteLatest = data?.[0]?.created_at
	const outdated = remoteLatest && (!localLatest || remoteLatest > localLatest)

	if (outdated) {
		log.info('freshness outdated', {slug, local: localLatest, remote: remoteLatest})
		await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
	}

	return !!outdated
}
