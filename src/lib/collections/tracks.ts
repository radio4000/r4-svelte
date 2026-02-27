import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {parseUrl} from 'media-now'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import type {Channel} from './channels'
import {trackMetaCollection, type TrackMeta} from './track-meta'
import {logger} from '$lib/logger'
import {getErrorMessage} from './utils'

const log = logger.ns('tracks').seal()
import {searchTracks} from '$lib/search-fts'
import type {Track} from '$lib/types'

function deriveProviderFields(url: string | null | undefined): Pick<Track, 'provider' | 'media_id'> {
	if (!url) return {provider: null, media_id: null}
	const parsed = parseUrl(url)
	return {provider: parsed?.provider || null, media_id: parsed?.id || null}
}

function withDerivedProvider(track: Track): Track {
	if (!track.url) return track
	const derived = deriveProviderFields(track.url)
	return {
		...track,
		provider: track.provider ?? derived.provider,
		media_id: track.media_id ?? derived.media_id
	}
}

export const tracksCollection = createCollection<Track, string>({
	...queryCollectionOptions({
		queryKey: (opts) => {
			const options = parseLoadSubsetOptions(opts)
			const slugEq = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			const slugIn = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'in')?.value
			const tagsIn = options.filters.find((f) => f.field[0] === 'tags' && f.operator === 'in')?.value
			const ftsEq = options.filters.find((f) => f.field[0] === 'fts' && f.operator === 'eq')?.value
			if (slugIn) return ['tracks', ...slugIn.sort()]
			if (slugEq) return ['tracks', slugEq]
			if (tagsIn) return ['tracks', 'tags', ...tagsIn.toSorted()]
			if (ftsEq) return ['tracks', 'search', ftsEq]
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
			const tagsIn = options.filters.find((f) => f.field[0] === 'tags' && f.operator === 'in')?.value
			const ftsEq = options.filters.find((f) => f.field[0] === 'fts' && f.operator === 'eq')?.value
			const createdAfter = options.filters.find((f) => f.field[0] === 'created_at' && f.operator === 'gt')?.value

			log.info('queryFn', {slugs, tagsIn, ftsEq, createdAfter})

			// Slug-based: fetch per channel
			if (slugs.length) {
				const results = await Promise.all(
					slugs.map(async (s: string) => {
						const tracks = await fetchTracksBySlug(s, {limit: options.limit, createdAfter})
						log.info('queryFn fetched', {slug: s, count: tracks.length})
						queryClient.setQueryData(['tracks', s], tracks)
						return tracks
					})
				)
				return results.flat()
			}

			// Global: fetch by tags
			if (tagsIn?.length) {
				let query = sdk.supabase.from('channel_tracks').select('*')
				query = query.overlaps('tags', tagsIn)
				query = query.order('created_at', {ascending: false}).limit(4000)
				const {data, error} = await query
				if (error) throw error
				const tracks = ((data || []) as Track[]).map(withDerivedProvider)
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			}

			// Global: full-text search
			if (ftsEq) {
				const tracks = (await searchTracks(ftsEq, {limit: 4000})).map(withDerivedProvider)
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			}

			return []
		}
	}),
	onInsert: async ({transaction}) => {
		log.info('onInsert', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const metadata = (m.metadata || {}) as Record<string, unknown>
			const serverTrack = await handleTrackInsert(m.modified, metadata)
			if (serverTrack) {
				// Merge view-only fields (e.g. slug) from the optimistic insert,
				// since createTrack returns from the tracks table, not channel_tracks view.
				const merged = withDerivedProvider({...m.modified, ...serverTrack})
				log.info('onInsert writeUpsert', {id: merged.id})
				tracksCollection.utils.writeUpsert(merged)
			}
		}
		log.info('onInsert done')
	},
	onUpdate: async ({transaction}) => {
		log.info('onUpdate', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const serverTrack = await handleTrackUpdate(m.modified.id, m.changes as Record<string, unknown>)
			if (serverTrack) {
				const normalized = withDerivedProvider(serverTrack)
				log.info('onUpdate writeUpsert', {id: normalized.id})
				tracksCollection.utils.writeUpsert(normalized)
			}
		}
		log.info('onUpdate done')
	},
	onDelete: async ({transaction}) => {
		log.info('onDelete', {count: transaction.mutations.length})
		let slug: string | undefined
		for (const m of transaction.mutations) {
			slug ??= (m.metadata as Record<string, unknown>)?.slug as string | undefined
			await handleTrackDelete(m.original.id)
		}
		if (slug) await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
		log.info('onDelete done', {slug})
	}
})

async function fetchTracksBySlug(slug: string, opts?: {limit?: number; createdAfter?: string}): Promise<Track[]> {
	log.info('tracks fetch', {slug, limit: opts?.limit, createdAfter: opts?.createdAfter})
	let query = sdk.supabase.from('channel_tracks').select('*').eq('slug', slug).order('created_at', {ascending: false})
	if (opts?.limit) query = query.limit(opts.limit)
	if (opts?.createdAfter) query = query.gt('created_at', opts.createdAfter)

	const {data, error} = await query
	if (error) throw error
	return ((data || []) as Track[]).map(withDerivedProvider)
}

async function handleTrackInsert(track: Track, metadata: Record<string, unknown>): Promise<Track | null> {
	const channelId = metadata?.channelId as string
	if (!channelId) throw new Error('channelId required in transaction metadata')
	log.info('insert_start', {clientId: track.id, title: track.title, channelId})
	const {data, error} = await sdk.tracks.createTrack(channelId, {
		id: track.id,
		url: track.url,
		title: track.title,
		description: track.description || undefined
	})
	log.info('insert_done', {clientId: track.id, serverId: data?.id, match: track.id === data?.id, error})
	if (error) throw new Error(getErrorMessage(error))
	return (data as Track) ?? null
}

async function handleTrackUpdate(id: string, changes: Record<string, unknown>): Promise<Track | null> {
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
	const {provider, media_id} = deriveProviderFields(input.url)
	return tracksCollection
		.insert(
			{
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
			},
			{metadata: {channelId: channel.id, slug: channel.slug}}
		)
		.isPersisted.promise.then(() => {})
}

export function updateTrack(channel: {id: string; slug: string}, id: string, changes: Record<string, unknown>) {
	const nextChanges = {...changes}
	if (typeof nextChanges.url === 'string') {
		Object.assign(nextChanges, deriveProviderFields(nextChanges.url))
	}
	return tracksCollection
		.update(id, {metadata: {slug: channel.slug}}, (draft) => {
			Object.assign(draft, nextChanges)
		})
		.isPersisted.promise.then(() => {})
}

export function deleteTrack(channel: {id: string; slug: string}, id: string) {
	return tracksCollection.delete(id, {metadata: {slug: channel.slug}}).isPersisted.promise.then(() => {})
}

export function batchUpdateTracksUniform(channel: Channel, ids: string[], changes: Record<string, unknown>) {
	const nextChanges = {...changes}
	if (typeof nextChanges.url === 'string') {
		Object.assign(nextChanges, deriveProviderFields(nextChanges.url))
	}
	return tracksCollection
		.update(ids, {metadata: {slug: channel.slug}}, (drafts) => {
			for (const draft of drafts as Array<Track>) {
				Object.assign(draft, nextChanges)
			}
		})
		.isPersisted.promise.then(() => {})
}

export function batchUpdateTracksIndividual(
	channel: Channel,
	updates: Array<{id: string; changes: Record<string, unknown>}>
) {
	const normalizedUpdates = updates.map((update) => {
		const nextChanges = {...update.changes}
		if (typeof nextChanges.url === 'string') {
			Object.assign(nextChanges, deriveProviderFields(nextChanges.url))
		}
		return {...update, changes: nextChanges}
	})

	return tracksCollection
		.update(
			normalizedUpdates.map((u) => u.id),
			{metadata: {slug: channel.slug}},
			(drafts) => {
				for (const draft of drafts as Array<Track>) {
					const update = normalizedUpdates.find((u) => u.id === draft.id)
					if (update) Object.assign(draft, update.changes)
				}
			}
		)
		.isPersisted.promise.then(() => {})
}

export function batchDeleteTracks(channel: Channel, ids: string[]) {
	return tracksCollection.delete(ids, {metadata: {slug: channel.slug}}).isPersisted.promise.then(() => {})
}

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
			const countMismatch = remoteCount !== cachedTracks.length
			const outdated = countMismatch || (remoteLatest && (!localLatest || remoteLatest > localLatest))

			log.info('freshness', {
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

export async function ensureTracksLoaded(slug: string): Promise<void> {
	const existing = [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
	if (existing.length) return

	const data = await queryClient.fetchQuery<Track[]>({
		queryKey: ['tracks', slug],
		queryFn: () => fetchTracksBySlug(slug),
		staleTime: 60 * 60 * 1000
	})

	// Ensure sync is started so write utils are available
	if (!tracksCollection.isReady()) {
		tracksCollection.startSyncImmediate()
	}

	tracksCollection.utils.writeBatch(() => {
		log.debug('ensureTracksLoaded', slug, data.length)
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
