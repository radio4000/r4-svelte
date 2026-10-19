import {appState} from '#lib/app-state.svelte.js'
import {tracksCollection} from '#lib/collections/tracks.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {followsCollection} from '#lib/collections/follows.js'
import {broadcastsCollection} from '#lib/collections/broadcasts.js'
import {deriveChannelActivityState} from '#lib/components/channel-ui-state.ts'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import type {BroadcastWithChannel} from '#lib/types.js'

// Direct-collection live queries bridge each collection's changes into Svelte
// reactivity without a d2ts pipeline. Reading their `data` below registers a
// dependency, so activity recomputes on any track/channel/follow/broadcast change,
// not just deck ticks (`.state` alone is a plain-Map snapshot and never triggers).
// $effect.root owns these app-lifetime queries; a singleton shared by all views.
let tracksLive: {data: unknown[]} | undefined
let channelsLive: {data: unknown[]} | undefined
let followsLive: {data: unknown[]} | undefined
let broadcastsLive: {data: BroadcastWithChannel[]} | undefined
$effect.root(() => {
	tracksLive = useLiveQuery(tracksCollection)
	channelsLive = useLiveQuery(channelsCollection)
	followsLive = useLiveQuery(followsCollection)
	broadcastsLive = useLiveQuery(broadcastsCollection)
})

const channelActivity = $derived.by(() => {
	// Reactive triggers — recompute on any collection change, not just deck churn.
	void tracksLive?.data.length
	void channelsLive?.data.length
	void followsLive?.data.length
	const broadcastRows = broadcastsLive?.data ?? [...broadcastsCollection.state.values()]

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
