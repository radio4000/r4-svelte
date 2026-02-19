import {sdk} from '@radio4000/sdk'
import type {Channel} from '$lib/types'

export async function fetchChannelBySlug(slug: string): Promise<Channel | null> {
	const {data} = await sdk.channels.readChannel(slug)
	return (data as Channel) ?? null
}
