import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {NonRetriableError} from '@tanstack/offline-transactions'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import type {PendingMutation} from '@tanstack/db'
import {fetchAllChannels, fetchChannelBySlug} from '$lib/api/fetch-channels'
import {uuid} from '$lib/utils'
import {queryClient} from './query-client'
import {log, txLog, getErrorMessage} from './utils'
import {getOfflineExecutor} from './offline-executor'
import type {Channel} from '$lib/types'

export type {Channel}

export const channelsCollection = createCollection<Channel, string>(
	queryCollectionOptions({
		queryKey: (opts) => {
			const options = parseLoadSubsetOptions(opts)
			const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
			return slug ? ['channels', slug] : ['channels']
		},
		syncMode: 'on-demand',
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async (ctx) => {
			const options = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)
			const slug = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value

			if (slug) {
				log.info('channels queryFn (single)', {slug})
				const channel = await fetchChannelBySlug(slug as string)
				return channel ? [channel] : []
			}

			log.info('channels queryFn (all)')
			return fetchAllChannels()
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
				channelsCollection.utils.writeUpsert(mutation.modified as Channel)
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
			if (appState.broadcasting_channel_id === id) appState.broadcasting_channel_id = undefined
		}
	})
	return tx.commit()
}
