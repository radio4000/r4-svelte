import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import {fetchChannelBySlug} from '$lib/api/fetch-channels'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {logger} from '$lib/logger'
import {getErrorMessage} from './utils'
import {capabilities} from '$lib/modes'

const log = logger.ns('channels').seal()
import type {Channel} from '$lib/types'

export type {Channel}

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
	} else if (params.imageNotNull && params.trackCountGte) {
		query = query.not('image', 'is', null).gte('track_count', params.trackCountGte)
	} else if (params.trackCountGte) {
		query = query.gte('track_count', params.trackCountGte)
	}
	if (params.coordinatesNotNull) {
		query = query.not('latitude', 'is', null).not('longitude', 'is', null)
	}
	const {count, error} = await query
	if (error) return 0
	return count ?? 0
}

/** Parse d2ts loadSubsetOptions into domain params. Shared by queryKey and queryFn. */
function parseChannelParams(opts: Parameters<typeof parseLoadSubsetOptions>[0]) {
	let options: ReturnType<typeof parseLoadSubsetOptions>
	try {
		options = parseLoadSubsetOptions(opts)
	} catch {
		return {
			slug: undefined as string | undefined,
			idIn: undefined as string[] | undefined,
			trackCountGte: undefined as number | undefined,
			imageNotNull: false,
			coordinatesNotNull: false,
			shuffle: false,
			offset: undefined as number | undefined,
			orderColumn: 'created_at' as string | undefined,
			ascending: true,
			sortKey: 'default'
		}
	}
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
		(f) => f.operator === 'not' || (f.field[0] === 'image' && f.operator === 'isNull')
	)
	const coordinatesNotNull = options.filters.some((f) => f.field[0] === 'latitude')
	const sort = options.sorts[0]
	const shuffle = sort?.field[0] === 'shuffle'
	const offset = (opts as Record<string, unknown> | undefined)?.offset as number | undefined
	return {
		slug,
		idIn,
		trackCountGte,
		imageNotNull,
		coordinatesNotNull,
		shuffle,
		offset,
		orderColumn: shuffle ? undefined : ((sort?.field[0] as string) ?? 'created_at'),
		ascending: sort ? sort.direction === 'asc' : true,
		sortKey: shuffle ? 'shuffle' : sort ? `${sort.field[0]}_${sort.direction}` : 'default'
	}
}

export const channelsCollection = createCollection<Channel, string>({
	...queryCollectionOptions({
		queryKey: (opts) => {
			const {slug, idIn, trackCountGte, imageNotNull, coordinatesNotNull, sortKey, offset} =
				parseChannelParams(opts)
			if (slug) return ['channels', slug]
			if (idIn) return ['channels', 'ids', ...idIn.toSorted()]
			// Include limit+offset so different pages get separate cache entries.
			// With a function queryKey, on-demand mode does NOT auto-append
			// loadSubsetOptions like it does for static keys.
			const limit = opts?.limit ?? 0
			const off = offset ?? 0
			const segments: (string | number)[] = ['channels']
			if (coordinatesNotNull) segments.push('geo')
			if (imageNotNull && trackCountGte) return [...segments, 'artwork', sortKey, limit, off]
			if (trackCountGte) return [...segments, 'minTracks', trackCountGte, sortKey, limit, off]
			return [...segments, sortKey, limit, off]
		},
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
				// No remote channel — preserve local imports so they aren't wiped
				const local = all.find((c) => c?.slug === p.slug)
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
				let idQuery = sdk.supabase
					.from(p.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks')
					.select('*')
					.in('id', remoteIds)
				if (!p.shuffle)
					idQuery = idQuery.order(p.orderColumn ?? 'created_at', {ascending: p.ascending})
				const {data, error} = await idQuery.limit(remoteIds.length)
				if (error) throw error
				return [...localMatches, ...(data || [])] as Channel[]
			}
			log.info('channels queryFn', p)
			const limit =
				ctx.meta?.loadSubsetOptions?.limit ?? (p.coordinatesNotNull ? 5000 : CHANNELS_PAGE_SIZE)
			const view = p.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks'
			let query = sdk.supabase.from(view).select('*')
			if (p.trackCountGte) query = query.gte('track_count', p.trackCountGte)
			if (p.imageNotNull) query = query.not('image', 'is', null)
			if (p.coordinatesNotNull)
				query = query.not('latitude', 'is', null).not('longitude', 'is', null)
			if (!p.shuffle) query = query.order(p.orderColumn ?? 'created_at', {ascending: p.ascending})
			query = query.range(p.offset ?? 0, (p.offset ?? 0) + limit - 1)
			const {data, error} = await query
			if (error) throw error
			return (data ?? []) as Channel[]
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
		.isPersisted.promise.then(() => channel)
}

export function updateChannel(id: string, changes: Record<string, unknown>) {
	return channelsCollection
		.update(id, (draft) => {
			Object.assign(draft, changes)
		})
		.isPersisted.promise.then(() => {
			// Keep appState.channel in sync so the header link etc. reflect the change
			if (appState.channel?.id === id) {
				appState.channel = {...appState.channel, ...changes} as typeof appState.channel
			}
		})
}

export function deleteChannel(id: string) {
	// Clean up app state (not managed by collection, not automatically rolled back)
	appState.channels = appState.channels?.filter((cid) => cid !== id)
	if (appState.channel?.id === id) appState.channel = undefined
	for (const deck of Object.values(appState.decks)) {
		if (deck.broadcasting_channel_id === id) deck.broadcasting_channel_id = undefined
	}
	return channelsCollection.delete(id).isPersisted.promise.then(() => {})
}
