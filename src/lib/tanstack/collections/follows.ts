import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {appState} from '$lib/app-state.svelte'
import {queryClient} from './query-client'

// Channel IDs the current user follows
export const followsCollection = createCollection<{id: string}, string>(
	queryCollectionOptions({
		queryKey: () => {
			const userChannelId = appState.channels?.[0]
			return userChannelId ? ['follows', userChannelId] : ['follows']
		},
		queryClient,
		getKey: (item) => item.id,
		staleTime: 24 * 60 * 60 * 1000,
		queryFn: async () => {
			const userChannelId = appState.channels?.[0]
			if (!userChannelId) return []
			const {data} = await sdk.channels.readFollowings(userChannelId)
			return (data || []).map((ch) => ({id: ch.id}))
		}
	})
)

export async function loadUserFollows() {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return
	await queryClient.invalidateQueries({queryKey: ['follows', userChannelId]})
}

export async function followChannel(channelId: string) {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return

	followsCollection.utils.writeInsert({id: channelId})
	const {error} = await sdk.channels.followChannel(userChannelId, channelId)
	if (error) followsCollection.utils.writeDelete(channelId)
}

export async function unfollowChannel(channelId: string) {
	const userChannelId = appState.channels?.[0]
	if (!userChannelId) return

	followsCollection.utils.writeDelete(channelId)
	const {error} = await sdk.channels.unfollowChannel(userChannelId, channelId)
	if (error) followsCollection.utils.writeInsert({id: channelId})
}
