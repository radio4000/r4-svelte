import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import {fetchChannelBySlug} from '$lib/api/fetch-channels'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {logger} from '$lib/logger'
import {getErrorMessage} from './utils'
import {appMode} from '$lib/config'

const log = logger.ns('channels').seal()
import type {Channel} from '$lib/types'

export type {Channel}

export const CHANNELS_PAGE_SIZE = 20

export type ChannelQueryParams = {
	idIn?: string[]
	trackCountGte?: number
	imageNotNull?: boolean
	orderColumn?: string
	ascending?: boolean
	shuffle?: boolean
}

/** Build a Supabase channels query (without limit/range). Shared by queryFn and loadMoreChannels. */
function buildChannelsQuery(params: ChannelQueryParams) {
	const view = params.shuffle ? 'random_channels_with_tracks' : 'channels_with_tracks'
	let query = sdk.supabase.from(view).select('*')
	if (params.idIn?.length) {
		query = query.in('id', params.idIn)
	} else if (params.imageNotNull && params.trackCountGte) {
		query = query.not('image', 'is', null).gte('track_count', params.trackCountGte)
	} else if (params.trackCountGte) {
		query = query.gte('track_count', params.trackCountGte)
	}
	if (params.shuffle) return query
	return query.order(params.orderColumn ?? 'created_at', {ascending: params.ascending ?? true})
}

/** Fetch the next page of channels and upsert into the collection. */
export async function loadMoreChannels(
	params: ChannelQueryParams & {offset: number; limit: number}
): Promise<Channel[]> {
	log.info('channels loadMore', {offset: params.offset, limit: params.limit})
	const {data, error} = await buildChannelsQuery(params).range(params.offset, params.offset + params.limit - 1)
	if (error) throw error
	const channels = (data || []) as Channel[]
	if (channels.length) {
		channelsCollection.utils.writeBatch(() => {
			channels.forEach((ch) => {
				channelsCollection.utils.writeUpsert(ch)
			})
		})
	}
	return channels
}

/** Parse d2ts loadSubsetOptions into domain params. Shared by queryKey and queryFn. */
function parseChannelParams(opts: Parameters<typeof parseLoadSubsetOptions>[0]) {
	const options = parseLoadSubsetOptions(opts)
	const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value as string | undefined
	const idIn = options.filters.find((f) => f.field[0] === 'id' && f.operator === 'in')?.value as string[] | undefined
	const trackCountGte = options.filters.find((f) => f.field[0] === 'track_count' && f.operator === 'gte')?.value as
		| number
		| undefined
	const imageNotNull = options.filters.some(
		(f) => f.operator === 'not' || (f.field[0] === 'image' && f.operator === 'isNull')
	)
	const sort = options.sorts[0]
	const shuffle = sort?.field[0] === 'shuffle'
	return {
		slug,
		idIn,
		trackCountGte,
		imageNotNull,
		shuffle,
		orderColumn: shuffle ? undefined : ((sort?.field[0] as string) ?? 'created_at'),
		ascending: sort ? sort.direction === 'asc' : true,
		sortKey: shuffle ? 'shuffle' : sort ? `${sort.field[0]}_${sort.direction}` : 'default'
	}
}

export const channelsCollection = createCollection<Channel, string>({
	...queryCollectionOptions({
		queryKey: (opts) => {
			const {slug, idIn, trackCountGte, imageNotNull, sortKey} = parseChannelParams(opts)
			if (slug) return ['channels', slug]
			if (idIn) return ['channels', 'ids', ...idIn.toSorted()]
			if (imageNotNull && trackCountGte) return ['channels', 'artwork', sortKey]
			if (trackCountGte) return ['channels', 'minTracks', trackCountGte, sortKey]
			return ['channels', sortKey]
		},
		syncMode: 'on-demand',
		queryClient,
		getKey: (item) => item.id,
		staleTime: 60 * 60 * 1000,
		queryFn: async (ctx) => {
			const p = parseChannelParams(ctx.meta?.loadSubsetOptions)
			const all = [...channelsCollection.state.values()]

			if (appMode === 'standalone') {
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
			log.info('channels queryFn', p)
			const {data, error} = await buildChannelsQuery(p).limit(CHANNELS_PAGE_SIZE)
			if (error) throw error
			return (data || []) as Channel[]
		}
	}),
	onInsert: async ({transaction}) => {
		log.info('channels onInsert', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const metadata = (m.metadata || {}) as Record<string, unknown>
			await handleChannelInsert(m.modified, metadata)
		}
		log.info('channels onInsert done')
	},
	onUpdate: async ({transaction}) => {
		log.info('channels onUpdate', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			const serverChannel = await handleChannelUpdate(m.modified.id, m.changes as Record<string, unknown>)
			if (serverChannel) {
				log.info('channels onUpdate writeUpsert', {id: serverChannel.id})
				channelsCollection.utils.writeUpsert(serverChannel)
			}
		}
		log.info('channels onUpdate done')
	},
	onDelete: async ({transaction}) => {
		log.info('channels onDelete', {count: transaction.mutations.length})
		for (const m of transaction.mutations) {
			await handleChannelDelete(m.original.id)
			channelsCollection.utils.writeDelete(m.original.id)
		}
		await queryClient.invalidateQueries({queryKey: ['channels']})
		log.info('channels onDelete done')
	}
})

async function handleChannelInsert(channel: Channel, metadata: Record<string, unknown>): Promise<void> {
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
	if (data?.id) {
		appState.channels = [...(appState.channels || []), data.id]
	}
}

async function handleChannelUpdate(id: string, changes: Record<string, unknown>): Promise<Channel | null> {
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

export function createChannel(input: {name: string; slug: string; description?: string}): Promise<Channel> {
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
	return channelsCollection.insert(channel, {metadata: {userId}}).isPersisted.promise.then(() => channel)
}

export function updateChannel(id: string, changes: Record<string, unknown>) {
	return channelsCollection
		.update(id, (draft) => {
			Object.assign(draft, changes)
		})
		.isPersisted.promise.then(() => {})
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
