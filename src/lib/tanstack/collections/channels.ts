import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {NonRetriableError} from '@tanstack/offline-transactions'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import type {PendingMutation} from '@tanstack/db'
import {fetchChannelBySlug} from '$lib/api/fetch-channels'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {log, txLog, getErrorMessage} from './utils'
import {getOfflineExecutor} from './offline-executor'
import type {Channel} from '$lib/types'

export type {Channel}

export const CHANNELS_PAGE_SIZE = 20

export type ChannelQueryParams = {
	idIn?: string[]
	trackCountGte?: number
	imageNotNull?: boolean
	orderColumn?: string
	ascending?: boolean
}

/** Build a Supabase channels query (without limit/range). Shared by queryFn and loadMoreChannels. */
function buildChannelsQuery(params: ChannelQueryParams) {
	let query = sdk.supabase.from('channels_with_tracks').select('*')
	if (params.idIn?.length) {
		query = query.in('id', params.idIn)
	} else if (params.imageNotNull && params.trackCountGte) {
		query = query.not('image', 'is', null).gte('track_count', params.trackCountGte)
	} else if (params.trackCountGte) {
		query = query.gte('track_count', params.trackCountGte)
	}
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
	return {
		slug,
		idIn,
		trackCountGte,
		imageNotNull,
		orderColumn: (sort?.field[0] as string) ?? 'created_at',
		ascending: sort ? sort.direction === 'asc' : true,
		sortKey: sort ? `${sort.field[0]}_${sort.direction}` : 'default'
	}
}

export const channelsCollection = createCollection<Channel, string>(
	queryCollectionOptions({
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
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async (ctx) => {
			const p = parseChannelParams(ctx.meta?.loadSubsetOptions)
			if (p.slug) {
				log.info('channels queryFn (single)', {slug: p.slug})
				const channel = await fetchChannelBySlug(p.slug)
				return channel ? [channel] : []
			}
			log.info('channels queryFn', p)
			const {data, error} = await buildChannelsQuery(p).limit(CHANNELS_PAGE_SIZE)
			if (error) throw error
			return (data || []) as Channel[]
		}
	})
)

async function handleChannelInsert(mutation: PendingMutation, metadata: Record<string, unknown>): Promise<void> {
	const channel = mutation.modified as {id: string; name: string; slug: string}
	const userId = metadata.userId as string
	if (!channel) throw new NonRetriableError('Invalid mutation: missing modified data')
	if (!userId) throw new NonRetriableError('userId required in transaction metadata')
	log.info('channel_insert_start', {id: channel.id, name: channel.name})
	const response = await sdk.channels.createChannel({
		id: channel.id,
		name: channel.name,
		slug: channel.slug,
		userId
	})
	if ('error' in response && response.error) {
		log.info('channel_insert_done', {clientId: channel.id, error: response.error})
		throw new NonRetriableError(getErrorMessage(response.error))
	}
	const data = 'data' in response ? (response.data as {id: string} | null) : null
	log.info('channel_insert_done', {clientId: channel.id, serverId: data?.id})
	if (data?.id) {
		appState.channels = [...(appState.channels || []), data.id]
	}
}

async function handleChannelUpdate(mutation: PendingMutation): Promise<void> {
	const channel = mutation.modified as {id: string}
	const changes = mutation.changes as Record<string, unknown>
	const actualChanges = {...changes}
	delete actualChanges.updated_at
	if (Object.keys(actualChanges).length === 0) {
		log.info('channel_update_skip', {id: channel.id, reason: 'no changes'})
		return
	}
	log.info('channel_update_start', {id: channel.id, changes: actualChanges})
	const response = await sdk.channels.updateChannel(channel.id, actualChanges)
	log.info('channel_update_done', {id: channel.id, error: response.error})
	if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
}

async function handleChannelDelete(mutation: PendingMutation): Promise<void> {
	const channel = mutation.original as {id: string}
	log.info('channel_delete_start', {id: channel.id})
	const response = await sdk.channels.deleteChannel(channel.id)
	log.info('channel_delete_done', {id: channel.id, error: response.error})
	if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
}

export const channelsAPI = {
	async syncChannels({
		transaction,
		idempotencyKey
	}: {
		transaction: {mutations: Array<PendingMutation>; metadata?: Record<string, unknown>}
		idempotencyKey: string
	}) {
		const metadata = transaction.metadata || {}
		let needsFullInvalidation = false

		for (const mutation of transaction.mutations) {
			txLog.info('channels', {type: mutation.type, key: idempotencyKey.slice(0, 8)})
			if (mutation.type === 'insert') {
				await handleChannelInsert(mutation, metadata)
				needsFullInvalidation = true
			} else if (mutation.type === 'update') {
				await handleChannelUpdate(mutation)
				// Persist the optimistic data so it survives transaction cleanup
				channelsCollection.utils.writeUpsert(mutation.modified as unknown as Channel)
			} else if (mutation.type === 'delete') {
				await handleChannelDelete(mutation)
				needsFullInvalidation = true
			} else {
				txLog.warn('channels unhandled type', {type: mutation.type})
			}
		}
		log.info('channel_tx_complete', {idempotencyKey: idempotencyKey.slice(0, 8)})

		if (needsFullInvalidation) {
			await queryClient.invalidateQueries({queryKey: ['channels']})
		}
	}
}

export function createChannel(input: {name: string; slug: string; description?: string}): Promise<Channel> {
	const userId = appState.user?.id
	if (!userId) throw new Error('Must be signed in to create a channel')

	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncChannels',
		metadata: {userId},
		autoCommit: false
	})
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
	tx.mutate(() => {
		channelsCollection.insert(channel)
	})
	return tx.commit().then(() => channel)
}

export function updateChannel(id: string, changes: Record<string, unknown>) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncChannels',
		autoCommit: false
	})
	tx.mutate(() => {
		const channel = channelsCollection.get(id)
		if (!channel) return
		channelsCollection.update(id, (draft) => {
			Object.assign(draft, changes)
		})
	})
	return tx.commit()
}

export function deleteChannel(id: string) {
	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncChannels',
		autoCommit: false
	})
	tx.mutate(() => {
		const channel = channelsCollection.get(id)
		if (channel) {
			channelsCollection.delete(id)
			appState.channels = appState.channels?.filter((cid) => cid !== id)
			if (appState.channel?.id === id) appState.channel = undefined
			for (const deck of Object.values(appState.decks)) {
				if (deck.broadcasting_channel_id === id) deck.broadcasting_channel_id = undefined
			}
		}
	})
	return tx.commit()
}
