import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {BasicIndex, type LoadSubsetOptions} from '@tanstack/db'
import type {QueryKey} from '@tanstack/query-core'
import {sdk} from '@radio4000/sdk'
import {appState} from '#lib/app-state.svelte.js'
import {fetchChannelBySlug} from '#lib/api/fetch-channels.js'
import {uuid} from '#lib/utils.js'
import {queryClient} from './query-client'
import {logger} from '#lib/logger.js'
import {getErrorMessage} from './utils'
import {capabilities} from '#lib/modes.js'

const log = logger.ns('channels').seal()
import type {Channel} from '#lib/types.js'

export type {Channel}

/** Default page size for channel lists. */
export const CHANNELS_PAGE_SIZE = 20

export type ChannelQueryParams = {
	idIn?: string[]
	trackCountGte?: number
	imageNotNull?: boolean
	coordinatesNotNull?: boolean
	orderColumn?: string
	ascending?: boolean
	shuffle?: boolean
}

/** Fetch total count of channels matching the given params (HEAD request, no data). */
export async function fetchChannelCount(params: ChannelQueryParams = {}): Promise<number> {
	if (!capabilities.globalBrowse) return 0
	const view = params.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks'
	let query = sdk.supabase.from(view).select('*', {count: 'exact', head: true})
	if (params.idIn?.length) {
		query = query.in('id', params.idIn)
	} else {
		// Apply bounds independently so image-only and track-count-only filters each count correctly.
		if (params.imageNotNull) query = query.not('image', 'is', null)
		if (params.trackCountGte) query = query.gte('track_count', params.trackCountGte)
	}
	if (params.coordinatesNotNull) {
		query = query.not('latitude', 'is', null).not('longitude', 'is', null)
	}
	const {count, error} = await query
	if (error) return 0
	return count ?? 0
}

/**
 * Stamp rows with their position in the server's random order. The live query sorts by
 * this `shuffle` rank and keeps only ranked rows: without it the sort ties and the
 * collection's insertion order wins, so rows loaded earlier for other reasons (the
 * user's follows) crowd out the listing. Not a database column.
 */
export function rankShuffled(rows: Channel[], offset = 0): Channel[] {
	return rows.map((c, i) => ({...c, shuffle: offset + i}) as Channel)
}

/** Cached global channel/track counts for stats displays (home, menu). */
export function fetchAppStats(): Promise<{channels: number; tracks: number}> {
	return queryClient.fetchQuery({
		queryKey: ['stats', 'counts'],
		staleTime: 60 * 60 * 1000,
		queryFn: async () => {
			const [channels, tracks] = await Promise.all([
				sdk.supabase.from('channels_with_tracks').select('*', {count: 'exact', head: true}),
				sdk.supabase.from('channel_track').select('*', {count: 'exact', head: true})
			])
			return {channels: channels.count ?? 0, tracks: tracks.count ?? 0}
		}
	})
}

/** Translate pushed-down filters and ordering, including page-boundary tie requests. */
function parseChannelParams(opts: LoadSubsetOptions | undefined) {
	const options = parseLoadSubsetOptions(opts)
	const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value as
		| string
		| undefined
	const idIn = options.filters.find((f) => f.field[0] === 'id' && f.operator === 'in')?.value as
		| string[]
		| undefined
	const trackCountGte = options.filters.find(
		(f) => f.field[0] === 'track_count' && f.operator === 'gte'
	)?.value as number | undefined
	const imageNotNull = options.filters.some(
		(f) => f.field[0] === 'image' && f.operator === 'not_isNull'
	)
	const coordinatesNotNull = ['latitude', 'longitude'].every((field) =>
		options.filters.some((f) => f.field[0] === field && f.operator === 'not_isNull')
	)
	const sort = options.sorts[0]
	const shuffle =
		sort?.field[0] === 'shuffle' || options.filters.some((f) => f.field[0] === 'shuffle')
	const shuffleRank = options.filters.find((f) => f.field[0] === 'shuffle' && f.operator === 'eq')
		?.value as number | undefined
	const equalities = options.filters.filter((f) => f.operator === 'eq' && f.field[0] !== 'shuffle')
	const offset = opts?.offset
	return {
		slug,
		idIn,
		trackCountGte,
		imageNotNull,
		coordinatesNotNull,
		shuffle,
		shuffleRank,
		equalities,
		offset,
		orderColumn: shuffle ? undefined : ((sort?.field[0] as string) ?? 'created_at'),
		ascending: sort ? sort.direction === 'asc' : true,
		nullsFirst: sort ? sort.nulls === 'first' : false
	}
}

/**
 * On-demand channel collection, keyed by id. Fetched by slug, id list, or paginated
 * browse query (with optional track-count/image/coordinate filters) — see `parseChannelParams`.
 */
export const channelsCollection = createCollection<Channel, string>({
	...queryCollectionOptions<Channel, unknown, QueryKey, string>({
		autoIndex: 'eager',
		defaultIndexType: BasicIndex,
		queryKey: ['channels'],
		syncMode: 'on-demand',
		queryClient,
		getKey: (item) => item.id,
		staleTime: 60 * 60 * 1000,
		queryFn: async (ctx): Promise<Channel[]> => {
			const p = parseChannelParams(ctx.meta?.loadSubsetOptions)
			const all = [...channelsCollection.state.values()]

			if (!capabilities.globalBrowse) {
				const localIds = new Set(appState.local_channel_ids ?? [])
				if (p.slug) return all.filter((c) => c.slug === p.slug)
				return all.filter((c) => localIds.has(c.id))
			}

			if (p.slug) {
				log.info('channels queryFn (single)', {slug: p.slug})
				const channel = await fetchChannelBySlug(p.slug)
				if (channel) return [channel]
				// No remote channel: a local import, read from appState, its durable copy. The
				// collection's row is gone once the channel page that owned it unmounts.
				const local = (appState.local_channels ?? []).find((c) => c.slug === p.slug)
				if (local && appState.local_channel_ids?.includes(local.id)) return [local]
				return []
			}
			// Local imported channels are not in Supabase — serve them from appState directly
			if (p.idIn) {
				const localIds = new Set(appState.local_channel_ids ?? [])
				const localMatches = (appState.local_channels ?? []).filter(
					(c) => p.idIn?.includes(c.id) && localIds.has(c.id)
				)
				const remoteIds = p.idIn.filter((id) => !localIds.has(id))
				if (!remoteIds.length) return localMatches
				// Serve channels already in the collection from cache (fresh within staleTime),
				// fetching only the ids we're missing. Avoids re-fetching a channel we just
				// loaded by slug (the by-id resolution on every channel page) and shrinks
				// follower/following hydration batches on revisits. Shuffle skips the cache so
				// randomized ordering still comes from the server.
				const cachedById = p.shuffle
					? new Map<string, Channel>()
					: new Map(all.map((c) => [c.id, c]))
				const cachedMatches = remoteIds
					.map((id) => cachedById.get(id))
					.filter((c): c is Channel => Boolean(c))
				const missingIds = remoteIds.filter((id) => !cachedById.has(id))
				if (!missingIds.length) return [...localMatches, ...cachedMatches]
				let idQuery = sdk.supabase
					.from(p.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks')
					.select('*')
					.in('id', missingIds)
				if (!p.shuffle)
					idQuery = idQuery.order(p.orderColumn ?? 'created_at', {ascending: p.ascending})
				const {data, error} = await idQuery.limit(missingIds.length)
				if (error) throw error
				return [...localMatches, ...cachedMatches, ...(data || [])] as Channel[]
			}
			// A missing limit means the whole matching set, not a default page. DB uses
			// that response as authoritative: truncating it can evict other pages.
			// Offset is the supported alternative to consuming the cursor hints.
			const limit =
				p.shuffleRank === undefined ? (ctx.meta?.loadSubsetOptions?.limit ?? Infinity) : 1
			const offset = p.shuffleRank ?? p.offset ?? 0
			// Keep the existing random browse order when a page grows. In particular,
			// a boundary equality asks for an already-ranked row, not another random draw.
			const shuffled = new Map<number, Channel>()
			if (p.shuffle) {
				for (const query of queryClient.getQueryCache().findAll({queryKey: ['channels']})) {
					const cached = parseChannelParams(query.meta?.loadSubsetOptions)
					if (
						!cached.shuffle ||
						cached.idIn ||
						cached.trackCountGte !== p.trackCountGte ||
						cached.imageNotNull !== p.imageNotNull ||
						cached.coordinatesNotNull !== p.coordinatesNotNull
					)
						continue
					for (const row of (query.state.data ?? []) as Channel[]) {
						if (typeof row.shuffle === 'number') shuffled.set(row.shuffle, row)
					}
				}
			}
			if (p.shuffleRank !== undefined) {
				const row = shuffled.get(p.shuffleRank)
				return row ? [row] : []
			}
			const result: Channel[] = []
			while (result.length < limit) {
				const row = shuffled.get(offset + result.length)
				if (!row) break
				result.push(row)
			}
			const view = p.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks'
			while (result.length < limit) {
				// Supabase caps responses at 1000, including unlimited and large windows.
				const size = Math.min(1000, limit - result.length)
				const from = offset + result.length
				let query = sdk.supabase.from(view).select('*')
				// DB closes page-boundary ties with an equality request, without a limit.
				for (const filter of p.equalities) query = query.eq(filter.field.join('.'), filter.value)
				if (p.trackCountGte) query = query.gte('track_count', p.trackCountGte)
				if (p.imageNotNull) query = query.not('image', 'is', null)
				if (p.coordinatesNotNull)
					query = query.not('latitude', 'is', null).not('longitude', 'is', null)
				if (!p.shuffle) {
					query = query
						.order(p.orderColumn ?? 'created_at', {
							ascending: p.ascending,
							nullsFirst: p.nullsFirst
						})
						.order('id', {ascending: true})
				}
				const {data, error} = await query.range(from, from + size - 1).abortSignal(ctx.signal)
				if (error) throw error
				const fresh = (data ?? []) as Channel[]
				result.push(...(p.shuffle ? rankShuffled(fresh, from) : fresh))
				if (fresh.length < size) break
			}
			return result
		}
	}),
	onInsert: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('channels onInsert', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const metadata = (m.metadata || {}) as Record<string, unknown>
			await handleChannelInsert(m.modified, metadata)
		}
		log.info('channels onInsert done')
	},
	onUpdate: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('channels onUpdate', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const serverChannel = await handleChannelUpdate(
				m.modified.id,
				m.changes as Record<string, unknown>
			)
			if (serverChannel) {
				log.info('channels onUpdate writeUpsert', {id: serverChannel.id})
				channelsCollection.utils.writeUpsert(serverChannel)
			}
		}
		log.info('channels onUpdate done')
	},
	onDelete: async ({transaction}) => {
		if (!capabilities.mutations) return
		log.info('channels onDelete', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			await handleChannelDelete(m.original.id)
			channelsCollection.utils.writeDelete(m.original.id)
		}
		await queryClient.invalidateQueries({queryKey: ['channels']})
		log.info('channels onDelete done')
	}
})

async function handleChannelInsert(
	channel: Channel,
	metadata: Record<string, unknown>
): Promise<void> {
	const userId = metadata.userId as string
	if (!userId) throw new Error('userId required in transaction metadata')
	log.info('channel_insert_start', {id: channel.id, name: channel.name})
	const response = await sdk.channels.createChannel({
		id: channel.id,
		name: channel.name,
		slug: channel.slug,
		userId
	})
	if ('error' in response && response.error) {
		log.info('channel_insert_done', {clientId: channel.id, error: response.error})
		throw new Error(getErrorMessage(response.error))
	}
	const data = 'data' in response ? (response.data as {id: string} | null) : null
	log.info('channel_insert_done', {clientId: channel.id, serverId: data?.id})
	if (data?.id && !appState.channels?.includes(data.id)) {
		appState.channels = [...(appState.channels || []), data.id]
	}
}

async function handleChannelUpdate(
	id: string,
	changes: Record<string, unknown>
): Promise<Channel | null> {
	const actualChanges = {...changes}
	delete actualChanges.updated_at
	if (Object.keys(actualChanges).length === 0) {
		log.info('channel_update_skip', {id, reason: 'no changes'})
		return null
	}
	log.info('channel_update_start', {id, changes: actualChanges})
	const response = await sdk.channels.updateChannel(id, actualChanges)
	log.info('channel_update_done', {id, error: response.error})
	if (response.error) throw new Error(getErrorMessage(response.error))
	return (response.data as Channel) ?? null
}

async function handleChannelDelete(id: string): Promise<void> {
	log.info('channel_delete_start', {id})
	const response = await sdk.channels.deleteChannel(id)
	log.info('channel_delete_done', {id, error: response.error})
	if (response.error) throw new Error(getErrorMessage(response.error))
}

/** Create a channel for the signed-in user. */
export function createChannel(input: {
	name: string
	slug: string
	description?: string
}): Promise<Channel> {
	const userId = appState.user?.id
	if (!userId) throw new Error('Must be signed in to create a channel')

	const channel: Channel = {
		id: uuid(),
		name: input.name,
		slug: input.slug,
		description: input.description || '',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		image: null,
		url: null,
		firebase_id: null,
		latitude: null,
		longitude: null,
		favorites: null,
		followers: null
	}
	return channelsCollection
		.insert(channel, {metadata: {userId}})
		.when('settled')
		.then(() => channel)
}

/** Update a channel's fields, keeping appState.channel in sync if it's the active one. */
export function updateChannel(id: string, changes: Record<string, unknown>) {
	return channelsCollection
		.update(id, (draft) => {
			Object.assign(draft, changes)
		})
		.when('settled')
		.then(() => {
			// Keep appState.channel in sync so the header link etc. reflect the change
			if (appState.channel?.id === id) {
				appState.channel = {...appState.channel, ...changes} as typeof appState.channel
			}
		})
}

/** Delete a channel and clean up app state that isn't rolled back automatically (deck, membership). */
export function deleteChannel(id: string) {
	// Clean up app state (not managed by collection, not automatically rolled back)
	appState.channels = appState.channels?.filter((cid) => cid !== id)
	if (appState.channel?.id === id) appState.channel = undefined
	for (const deck of Object.values(appState.decks)) {
		if (deck.broadcasting_channel_id === id) deck.broadcasting_channel_id = undefined
	}
	return channelsCollection
		.delete(id)
		.when('settled')
		.then(() => {})
}
