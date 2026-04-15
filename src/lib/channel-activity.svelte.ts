import {appState} from '$lib/app-state.svelte'
import {tracksCollection} from '$lib/collections/tracks'
import {channelsCollection} from '$lib/collections/channels'
import {followsCollection} from '$lib/collections/follows'
import {broadcastsCollection} from '$lib/collections/broadcasts'
import {deriveChannelActivityState} from '$lib/components/channel-ui-state.js'

const channelActivity = $derived.by(() => {
	void tracksCollection.state.size
	void channelsCollection.state.size
	void followsCollection.state.size
	const broadcastRows = [...broadcastsCollection.state.values()]

	return deriveChannelActivityState({
		decks: appState.decks,
		tracksState: tracksCollection.state,
		channelsState: channelsCollection.state,
		followsState: followsCollection.state,
		broadcastRows
	})
})

export function getChannelActivity() {
	return channelActivity
}
