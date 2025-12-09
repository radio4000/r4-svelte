import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {NonRetriableError} from '@tanstack/offline-transactions'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import type {PendingMutation} from '@tanstack/db'
import {fetchAllChannels, fetchChannelBySlug} from '$lib/api/fetch-channels'
import {queryClient} from './query-client'
import {log, txLog, completedIdempotencyKeys, getErrorMessage} from './utils'
import {getOfflineExecutor} from './offline-executor'
import type {Channel} from '$lib/types'

export type {Channel}

// Channels collection - on-demand: queries dictate what gets fetched
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
		staleTime: 24 * 60 * 60 * 1000, // 24h - channels rarely change
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

type MutationHandler = (mutation: PendingMutation, metadata: Record<string, unknown>) => Promise<void>

const channelMutationHandlers: Record<string, MutationHandler> = {
	insert: async (mutation, metadata) => {
		const channel = mutation.modified as {id: string; name: string; slug: string}
		const userId = metadata.userId as string
		if (!channel) throw new NonRetriableError('Invalid mutation: missing modified data')
		if (!userId) throw new NonRetriableError('userId required in transaction metadata')
		log.info('channel_insert_start', {id: channel.id, name: channel.name})
		try {
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
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	},
	update: async (mutation) => {
		const channel = mutation.modified as {id: string}
		const changes = mutation.changes as Record<string, unknown>
		log.info('channel_update_start', {id: channel.id, changes})
		try {
			const response = await sdk.channels.updateChannel(channel.id, changes)
			log.info('channel_update_done', {id: channel.id, error: response.error})
			if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	},
	delete: async (mutation) => {
		const channel = mutation.original as {id: string}
		log.info('channel_delete_start', {id: channel.id})
		try {
			const response = await sdk.channels.deleteChannel(channel.id)
			log.info('channel_delete_done', {id: channel.id, error: response.error})
			if (response.error) throw new NonRetriableError(getErrorMessage(response.error))
		} catch (err) {
			if (err instanceof NonRetriableError) throw err
			throw new NonRetriableError(getErrorMessage(err))
		}
	}
}

export const channelsAPI = {
	async syncChannels({
		transaction,
		idempotencyKey
	}: {
		transaction: {mutations: Array<PendingMutation>; metadata?: Record<string, unknown>}
		idempotencyKey: string
	}) {
		if (completedIdempotencyKeys.has(idempotencyKey)) {
			txLog.debug('channels skip duplicate', {key: idempotencyKey.slice(0, 8)})
			return
		}

		for (const mutation of transaction.mutations) {
			txLog.info('channels', {type: mutation.type, key: idempotencyKey.slice(0, 8)})
			const handler = channelMutationHandlers[mutation.type]
			if (handler) {
				await handler(mutation, transaction.metadata || {})
			} else {
				txLog.warn('channels unhandled type', {type: mutation.type})
			}
		}
		completedIdempotencyKeys.add(idempotencyKey)
		log.info('channel_tx_complete', {idempotencyKey: idempotencyKey.slice(0, 8)})

		await queryClient.invalidateQueries({queryKey: ['channels']})
	}
}

// Channel actions
export function createChannel(input: {name: string; slug: string; description?: string}) {
	const userId = appState.user?.id
	if (!userId) throw new Error('Must be signed in to create a channel')

	const tx = getOfflineExecutor().createOfflineTransaction({
		mutationFnName: 'syncChannels',
		metadata: {userId},
		autoCommit: false
	})
	const id = crypto.randomUUID()
	tx.mutate(() => {
		channelsCollection.insert({
			id,
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
		})
	})
	return tx.commit().then(() => ({id, slug: input.slug}))
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
			Object.assign(draft, changes, {updated_at: new Date().toISOString()})
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
		}
	})
	return tx.commit()
}
