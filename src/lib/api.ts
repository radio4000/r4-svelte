import {appState, authStatus} from '#lib/app-state.svelte.js'
import {LOCAL_STORAGE_KEYS, IDB_DATABASES} from '#lib/storage-keys.js'
import {leaveBroadcast} from '#lib/broadcast.js'
import {logger} from '#lib/logger.js'
import {capture} from '#lib/analytics.js'
import {sdk} from '@radio4000/sdk'
import {shuffleArray} from '#lib/utils.js'
import {getActiveQueue, queueInsertManyAfter, queueNext, queuePrev} from '#lib/player/queue.js'
import {tracksCollection} from '#lib/collections/tracks.js'
import {loadChannelTracks} from '#lib/player/channel-tracks.js'
import {openDeck} from '#lib/player/open-deck.js'
import {getDeck, clearAutoRadio} from '#lib/decks.js'
import {
	clearQueueFilter,
	getMediaPlayer,
	loadDeckView,
	pause,
	playChannel,
	playTrack,
	setUserInitiatedPlay
} from '#lib/player/playback.js'

import type {Channel, ChannelRef, Deck, PlayEndReason, PlayStartReason} from '#lib/types.js'

const log = logger.ns('api').seal()

export {setTheme, toggleTheme, openSearch} from '#lib/ui.js'
export {
	toggleQueuePanel,
	toggleVideo,
	expandDeck,
	toggleDeckCompact,
	togglePlayerExpanded
} from '#lib/decks.js'
export {
	joinAutoRadio,
	resyncAutoRadio,
	leaveAutoRadio,
	rejoinAutoRadio,
	playChannelAuto,
	toggleChannelPlay,
	toggleChannelAutoRadio
} from '#lib/player/auto-radio-actions.js'
export {
	newestFirst,
	getUserInitiatedPlay,
	setUserInitiatedPlay,
	clearUserInitiatedPlay,
	getMediaPlayer,
	playTrack,
	playChannel,
	setPlaylist,
	loadDeckView,
	togglePlayPause,
	recordSeekPosition,
	applyRemoteState,
	play,
	pause,
	togglePlay,
	seekTo,
	type MediaPlayer
} from '#lib/player/playback.js'

/** Return the active deck, creating a compact one when all decks are closed. */
export function ensureActiveDeck(): Deck {
	let deck = getDeck(appState.active_deck_id)
	if (!deck) {
		deck = openDeck({compact: true, activate: true})
	}
	return deck
}

// --- Auth ---

/** Verify auth state and refresh appState.channels/channel from the logged-in user's channels.
 *  Call on boot and after sign-in/out. Pass the session's user to skip the getUser() round trip. */
export async function checkUser(sessionUser?: {id: string}) {
	try {
		log.debug('checkUser')
		let user = sessionUser
		if (!user) {
			const {data: userData, error: userError} = await sdk.supabase.auth.getUser()
			user = userError ? undefined : (userData?.user ?? undefined)
		}
		if (!user) {
			appState.channels = []
			appState.channel = undefined
			for (const deck of Object.values(appState.decks)) {
				deck.broadcasting_channel_id = undefined
			}
			return null
		}

		// Same query as sdk.channels.readUserChannels(), but on channels_with_tracks so the
		// first channel comes with track_count and needs no follow-up readChannel().
		const {data, error: channelsError} = await sdk.supabase
			.from('channels_with_tracks')
			.select('*, user_channel!inner(user_id)')
			.eq('user_channel.user_id', user.id)
			.order('updated_at', {ascending: true})
		if (channelsError) throw channelsError
		const channels = (data ?? []).map(({user_channel: _, ...c}) => c) as Channel[]

		// Store IDs - collection handles fetching when needed
		appState.channels = channels.map((c) => c.id)
		appState.channel = channels[0]

		return user
	} catch (err) {
		log.warn('check_user_error', err)
	} finally {
		authStatus.channelChecked = true
	}
}

/** Play a track in a fresh deck rather than the active one (e.g. "open in new deck"). */
export async function playTrackInNewDeck(trackId: string, slug?: string) {
	const deck = openDeck({compact: true, activate: true})
	if (slug && !tracksCollection.get(trackId)) {
		await loadChannelTracks(slug)
	}
	await playTrack(deck.id, trackId, null, 'user_click_track')
	// A newly opened extra deck loads paused — the user starts it explicitly.
	setUserInitiatedPlay(deck.id, false)
}

/** Play a channel in a fresh deck rather than the active one (e.g. "open in new deck"). */
export async function playChannelInNewDeck(channel: ChannelRef) {
	const deck = openDeck({compact: true, activate: true})
	await playChannel(deck.id, channel)
	// A newly opened extra deck loads paused — the user starts it explicitly.
	setUserInitiatedPlay(deck.id, false)
}

/** Play channel starting from random track with shuffle enabled */
export async function shufflePlayChannel(deckId: number, {id, slug}: ChannelRef) {
	log.log('shuffle_play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	const d = getDeck(deckId)
	if (d) clearAutoRadio(d)
	const tracks = await loadChannelTracks(slug)
	if (!tracks.length) {
		log.warn('shuffle_play_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	const randomIndex = Math.floor(Math.random() * ids.length)
	// order:'shuffle' records intent in the view; actual shuffle is still deck-local
	// (deck.shuffle + playlist_tracks_shuffled). Unifying the two is a future step.
	loadDeckView(deckId, {sources: [{channels: [slug]}], order: 'shuffle'}, ids)
	const deck = getDeck(deckId)
	if (deck) deck.shuffle = true
	capture('player:channel_play', {channel_slug: slug, shuffle: true})
	await playTrack(deckId, ids[randomIndex], null, 'play_channel')
}

// --- Queue management ---

/** Append track IDs to the end of a deck's queue. */
export function addToPlaylist(deckId: number, trackIds: string[]) {
	const deck = getDeck(deckId)
	if (!deck) {
		log.warn('addToPlaylist: no deck', {deckId})
		return
	}
	const before = deck.playlist_tracks?.length ?? 0
	clearQueueFilter(deck)
	const currentTracks = deck.playlist_tracks || []
	deck.playlist_tracks = [...currentTracks, ...trackIds]

	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = shuffleArray(deck.playlist_tracks)
	}
	deck.view = undefined
	clearAutoRadio(deck)
	log.log('addToPlaylist', {
		deckId,
		added: trackIds.length,
		before,
		after: deck.playlist_tracks.length
	})
}

/** Queue track(s) to play after the current track */
export function playNext(deckId: number, trackIds: string | string[]) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearQueueFilter(deck)
	const ids = Array.isArray(trackIds) ? trackIds : [trackIds]
	const currentId = deck.playlist_track
	if (!currentId) {
		deck.playlist_tracks = ids
		deck.view = undefined
		clearAutoRadio(deck)
		return
	}
	deck.playlist_tracks = queueInsertManyAfter(deck.playlist_tracks, currentId, ids)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueInsertManyAfter(
			deck.playlist_tracks_shuffled,
			currentId,
			ids
		)
	}
	deck.view = undefined
	clearAutoRadio(deck)
	log.log('play_next', {deckId, ids, after: currentId})
}

/** Clear the queue but keep current track */
export function clearQueue(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearQueueFilter(deck)
	const current = deck.playlist_track
	if (current) {
		deck.playlist_tracks = [current]
		deck.playlist_tracks_shuffled = [current]
	} else {
		deck.playlist_tracks = []
		deck.playlist_tracks_shuffled = []
	}
	deck.view = undefined
	log.log('clear_queue', {deckId, kept: current})
}

/** Clear entire queue including current track */
export function clearAllQueue(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearQueueFilter(deck)
	deck.playlist_tracks = []
	deck.playlist_tracks_shuffled = []
	deck.playlist_track = undefined
	deck.view = undefined
	log.log('clear_all_queue', {deckId})
}

/** Toggle shuffle mode on/off */
export function toggleShuffle(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.shuffle = !deck.shuffle
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = shuffleArray(deck.playlist_tracks || [])
	}
	if (deck.view) {
		deck.view = {...deck.view, order: deck.shuffle ? 'shuffle' : undefined}
	}
}

/** Advance to the next track and wrap at the end; after a playback error, stop at the queue end instead. */
export function next(deckId: number, endReason: PlayEndReason) {
	const deck = getDeck(deckId)
	if (!deck?.playlist_track) {
		log.warn('No current track')
		return
	}
	const activeQueue = getActiveQueue(deck)
	if (!activeQueue.length) {
		log.warn('No active queue')
		return
	}
	const nextId = queueNext(activeQueue, deck.playlist_track)
	if (nextId) {
		const startReason: PlayStartReason =
			endReason === 'youtube_error'
				? 'track_error'
				: endReason === 'user_next'
					? 'user_next'
					: 'auto_next'
		playTrack(deckId, nextId, endReason, startReason)
	} else if (endReason === 'youtube_error') {
		// Never wrap after a failure: an unplayable queue would retry forever.
		log.info('Queue ended after playback error: stopping')
		const player = getMediaPlayer(deckId)
		if (player) pause(player)
		deck.is_playing = false
	} else if (activeQueue.length > 0) {
		log.info('Queue ended: looping to start')
		playTrack(deckId, activeQueue[0], endReason, 'auto_next')
	} else {
		log.info('No next track available')
	}
}

export function previous(deckId: number, endReason: PlayEndReason) {
	const deck = getDeck(deckId)
	if (!deck?.playlist_track) {
		log.warn('No current track')
		return
	}
	const activeQueue = getActiveQueue(deck)
	if (!activeQueue.length) {
		log.warn('No active queue')
		return
	}
	const prevId = queuePrev(activeQueue, deck.playlist_track)
	if (prevId) {
		playTrack(deckId, prevId, endReason, 'user_prev')
	} else {
		log.info('No previous track available')
	}
}

/** Clear the queue and reset the deck to stopped, unshuffled, video hidden. */
export function eject(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearAllQueue(deckId)
	deck.hide_video_player = true
	deck.shuffle = false
	deck.is_playing = false
}

// --- Local data ---

/**
 * Clears all local data (localStorage and IndexedDB).
 * Remote Radio4000 account data remains intact.
 * Typically followed by a page reload.
 */
export function resetLocalData() {
	for (const key of Object.values(LOCAL_STORAGE_KEYS)) {
		localStorage.removeItem(key)
	}
	for (const db of Object.values(IDB_DATABASES)) {
		indexedDB.deleteDatabase(db)
	}
}
