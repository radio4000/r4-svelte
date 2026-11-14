/**
 * Listener teardown: the realtime subscriptions a listener holds, and leaving them.
 * Split from broadcast.js so playback can leave a broadcast (a normal play does)
 * without importing broadcast.js, which imports playback.
 */
import {appState, removeDeck} from '#lib/app-state.svelte.js'
import {logger} from '#lib/logger.js'
import {clearUserInitiatedPlay} from '#lib/player/user-initiated-play.js'

const log = logger.ns('broadcast').seal()

/** Last state seq applied per broadcast channel; older messages are dropped.
 * @type {Map<string, number>}
 */
export const lastReceivedStateSeqByChannel = new Map()

/** Latest seek job per listener deck, so a newer seek cancels an older one.
 * @type {Map<number, number>}
 */
export const seekJobSeqByDeck = new Map()

/** Listener realtime state channels keyed by channelId
 * @type {Map<string, any>}
 */
export const broadcastStateListeners = new Map()

/** Broadcast table listeners keyed by channelId (for state refresh)
 * @type {Map<string, any>}
 */
export const broadcastTableListeners = new Map()

/** @param {number} deckId */
export function leaveBroadcast(deckId) {
	const channelId = appState.decks[deckId]?.listening_to_channel_id
	stopBroadcastSync(deckId)
	if (channelId) {
		stopBroadcastStateListener(channelId)
		stopBroadcastTableListener(channelId)
		closeListeningDecksForChannel(channelId)
	} else {
		// Fallback: if invoked on a non-listening deck, preserve old behavior.
		const deck = appState.decks[deckId]
		if (deck) {
			deck.listening_to_channel_id = undefined
			deck.is_playing = false
		}
	}
	log.log(`left deck ${deckId}`)
}

/** @param {number} deckId */
export function stopBroadcastSync(deckId) {
	seekJobSeqByDeck.delete(deckId)
}

export function stopBroadcastStateListener(channelId) {
	const channel = broadcastStateListeners.get(channelId)
	if (channel) {
		channel.unsubscribe()
		broadcastStateListeners.delete(channelId)
	}
	lastReceivedStateSeqByChannel.delete(channelId)
}

export function stopBroadcastTableListener(channelId) {
	const channel = broadcastTableListeners.get(channelId)
	if (channel) {
		channel.unsubscribe()
		broadcastTableListeners.delete(channelId)
	}
}

export function closeListeningDecksForChannel(channelId) {
	const decksToClose = Object.entries(appState.decks)
		.filter(([, deck]) => deck.listening_to_channel_id === channelId)
		.map(([id]) => Number(id))
	for (const id of decksToClose) {
		stopBroadcastSync(id)
		clearUserInitiatedPlay(id)
		removeDeck(id)
	}
}
