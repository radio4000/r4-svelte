import {sdk} from '@radio4000/sdk'
import {logger} from '$lib/logger'
import type {Channel} from '$lib/types'

const log = logger.ns('seed').seal()

export async function fetchChannelBySlug(slug: string): Promise<Channel | null> {
	const {data} = await sdk.channels.readChannel(slug)
	return (data as Channel) ?? null
}

export async function fetchAllChannels(): Promise<Channel[]> {
	const {data} = await sdk.channels.readChannels()
	const channels = (data || []) as Channel[]
	log.info('fetchAllChannels', {count: channels.length})
	return channels
}
