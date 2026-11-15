import {appState} from '#lib/app-state.svelte.js'
import {untrack} from 'svelte'
import {tracksCollection} from '#lib/collections/tracks.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {followsCollection} from '#lib/collections/follows.js'
import {broadcastsCollection} from '#lib/collections/broadcasts.js'
import {deriveChannelActivityState} from '#lib/components/channel-ui-state.ts'
import type {BroadcastWithChannel} from '#lib/types.js'

// Bumped by any collection change: `.state` is a plain-Map snapshot and never triggers.
// Browser only: on the server a subscription would sync every broadcast for the process's life.
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
