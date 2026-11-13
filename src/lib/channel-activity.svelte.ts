import {appState} from '#lib/app-state.svelte.js'
import {untrack} from 'svelte'
import {tracksCollection} from '#lib/collections/tracks.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {followsCollection} from '#lib/collections/follows.js'
import {broadcastsCollection} from '#lib/collections/broadcasts.js'
import {deriveChannelActivityState} from '#lib/components/channel-ui-state.ts'
import type {BroadcastWithChannel} from '#lib/types.js'

// One counter bumped by any track/channel/follow/broadcast change, so activity
// recomputes on those, not just deck ticks (`.state` alone is a plain-Map snapshot and
// never triggers). Change subscriptions, not live queries: nothing copies every row on
// each change. Held for the app's lifetime, as the live queries before them were, which
// also keeps these collections from being garbage-collected.
// Browser only: on the server a subscription starts the eager collections' sync, which
// fetches every broadcast once per server process and keeps it for the process's life.
let version = $state(0)
if (typeof window !== 'undefined') subscribeAll()

function subscribeAll() {
	const collections = [
		tracksCollection,
		channelsCollection,
		followsCollection,
		broadcastsCollection
	] as Array<{subscribeChanges: (callback: () => void) => unknown}>
	for (const collection of collections) {
		// untrack: changes can land while a $derived evaluates (state_unsafe_mutation)
		collection.subscribeChanges(() => untrack(() => version++))
	}
}

const channelActivity = $derived.by(() => {
	void version
	return deriveChannelActivityState({
		decks: appState.decks,
		tracksState: tracksCollection.state,
		channelsState: channelsCollection.state,
		followsState: followsCollection.state,
		broadcastRows: [...broadcastsCollection.state.values()] as BroadcastWithChannel[]
	})
})

export function getChannelActivity() {
	return channelActivity
}
