import {tick} from 'svelte'
import {appState, authStatus} from '#lib/app-state.svelte.js'
import {LOCAL_STORAGE_KEYS, IDB_DATABASES} from '#lib/storage-keys.js'
import {
	leaveBroadcast,
	notifyBroadcastState,
	upsertRemoteBroadcast,
	getBroadcastingChannelId
} from '#lib/broadcast.js'
import {logger} from '#lib/logger.js'
import {capture} from '#lib/analytics.js'
import {sdk} from '@radio4000/sdk'
import {shuffleArray, isDbId} from '#lib/utils.js'
import {getActiveQueue, queueInsertManyAfter, queueNext, queuePrev} from '#lib/player/queue.js'
import {tracksCollection, ensureTracksLoaded} from '#lib/collections/tracks.js'
import {channelTracks} from '#lib/player/channel-tracks.js'
import {openDeck} from '#lib/player/open-deck.js'
import {capturePlayHistory} from '#lib/player/play-history.js'
import {getDeck, maybeBroadcastNotify, clearAutoRadio} from '#lib/decks.js'

import type {Channel, ChannelRef, Deck, PlayEndReason, PlayStartReason} from '#lib/types.js'
import {normalizeView, type View} from '#lib/views.js'

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

/** Return the active deck, creating a compact one when all decks are closed. */
export function ensureActiveDeck(): Deck {
	let deck = getDeck(appState.active_deck_id)
	if (!deck) {
		deck = openDeck({compact: true, activate: true})
	}
	return deck
}

function isNormalPlayStart(startReason: PlayStartReason): boolean {
	return (
		startReason === 'user_click_track' ||
		startReason === 'play_search' ||
		startReason === 'play_channel'
	)
}

/** New queues and queue edits drop the queue filter and its playback subset. */
function clearQueueFilter(deck: Deck) {
	deck.queue_filter = undefined
	deck.playlist_tracks_filtered = undefined
}

function sameStringArray(a: string[], b: string[]): boolean {
	return a === b || (a.length === b.length && a.every((value, index) => value === b[index]))
}

/** Tracks by created_at, newest first. Parses each date once rather than per
 *  comparison, which cost ~50ms per play on a 2.6k-track channel at 4x CPU. */
export function newestFirst<T extends {created_at: string}>(tracks: T[]): T[] {
	return tracks
		.map((track) => ({track, ms: new Date(track.created_at).getTime()}))
		.sort((a, b) => b.ms - a.ms)
		.map(({track}) => track)
}

const userInitiatedPlayMap = new Map<number, boolean>()

/** Get the user-initiated play flag for a deck */
export function getUserInitiatedPlay(deckId: number) {
	return userInitiatedPlayMap.get(deckId) ?? false
}

/** Set the user-initiated play flag for a deck */
export function setUserInitiatedPlay(deckId: number, value: boolean) {
	userInitiatedPlayMap.set(deckId, value)
}

/** Remove the user-initiated play flag when a deck is destroyed. */
export function clearUserInitiatedPlay(deckId: number) {
	userInitiatedPlayMap.delete(deckId)
}

export type MediaPlayer = HTMLElement & {
	paused: boolean
	play(): Promise<void> | void
	pause(): void
	currentTime: number
	duration: number
	volume: number
	muted: boolean
}

/** Find the media player element for a given deck. */
export function getMediaPlayer(deckId: number): MediaPlayer | null {
	// Tag and class lookups are live collections the browser keeps; a [data-deck]
	// selector walks every node instead (~35k on a big tracklist page), on every poll.
	const id = String(deckId)
	const inDeck = (els: HTMLCollectionOf<Element>) => {
		for (const el of els) {
			if ((el.closest('[data-deck]') as HTMLElement | null)?.dataset.deck === id) return el
		}
		return null
	}
	return (inDeck(document.getElementsByTagName('youtube-video')) ||
		inDeck(document.getElementsByTagName('soundcloud-player')) ||
		inDeck(document.getElementsByClassName('native-audio-player'))) as MediaPlayer | null
}

/** Wait until a media element exists for a deck. Polls with setTimeout, not
 *  requestAnimationFrame — rAF callbacks are fully suspended while the document is
 *  hidden (backgrounded tab, locked mobile screen), which would hang this forever. */
async function waitForMediaPlayer(deckId: number, timeoutMs = 3000): Promise<MediaPlayer | null> {
	const deadline = performance.now() + timeoutMs
	while (performance.now() < deadline) {
		const player = getMediaPlayer(deckId)
		if (player && 'paused' in player) return player as MediaPlayer
		await new Promise((r) => setTimeout(r, 30))
	}
	return null
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

// --- Track/channel playback ---

/** Core playback entry point: loads a track into a deck and plays it, building the deck's
 *  playlist from same-channel tracks when needed. Every play action (click, next/prev,
 *  auto-radio, broadcast sync) routes through here with a startReason/endReason pair used
 *  for history and analytics. */
export async function playTrack(
	deckId: number,
	id: string,
	endReason: PlayEndReason | null,
	startReason: PlayStartReason
) {
	log.log('play_track', {deckId, id, endReason, startReason})
	let deck = getDeck(deckId)
	if (!deck) {
		// Auto-create deck when all decks have been closed
		deck = openDeck({compact: true, activate: true})
		deckId = deck.id
		log.log('play_track_created_deck', {deckId})
	}

	// Switching from live/auto to a normal play action should reuse this deck and clear mode state.
	if (isNormalPlayStart(startReason)) {
		if (deck.playlist_tracks_filtered && !deck.playlist_tracks_filtered.includes(id)) {
			clearQueueFilter(deck)
		}
		if (deck.listening_to_channel_id) leaveBroadcast(deckId)
		clearAutoRadio(deck)
		deck.auto_radio_rotation_start = undefined
	}

	let track = tracksCollection.get(id)
	// After a reload the deck's channel loads behind the first render; next/prev can beat it
	if (!track && deck.playlist_slug) {
		await ensureTracksLoaded(deck.playlist_slug).catch(() => {})
		track = tracksCollection.get(id)
	}
	if (!track) {
		log.warn('play_track_not_loaded', {id})
		deck.playlist_track = undefined
		return
	}

	// Ephemeral tracks (Discogs videos etc.) have non-UUID synthetic IDs
	const isEphemeral = !isDbId(id)

	// If same track is already loaded, just ensure it's playing (don't reload)
	if (deck.playlist_track === id && startReason === 'user_click_track') {
		log.log('play_track_same_track', {deckId, id})
		const player = await waitForMediaPlayer(deckId)
		play(deckId, player)
		return
	}

	// Set flag for user-initiated playback (respects autoplay setting for fresh decks)
	const userInitiatedReasons = [
		'user_click_track',
		'user_next',
		'user_prev',
		'play_channel',
		'play_search'
	]
	if (userInitiatedReasons.includes(startReason)) {
		const deckAlreadyPlaying = deck.is_playing || deck.playlist_track
		if (appState.autoplay_new_deck || deckAlreadyPlaying) {
			setUserInitiatedPlay(deckId, true)
		}
	}

	capturePlayHistory(deck, track, id, endReason, startReason, isEphemeral)

	deck.playlist_track = id
	if (!isEphemeral) deck.playlist_slug = track.slug ?? undefined
	if (startReason !== 'broadcast_sync') {
		deck.track_played_at = new Date().toISOString()
		deck.seeked_at = deck.track_played_at
		deck.seek_position = 0
	}
	if (!isEphemeral && (!deck.playlist_tracks.length || !deck.playlist_tracks.includes(id))) {
		// Queue what's loaded now, then again once the whole channel is in.
		const slug = deck.playlist_slug
		const queueChannel = () => {
			if (getDeck(deckId)?.playlist_slug !== slug) return
			const tracks = newestFirst(channelTracks(slug))
			setPlaylist(
				deckId,
				tracks.map((t) => t.id)
			)
		}
		queueChannel()
		if (slug) ensureTracksLoaded(slug).then(queueChannel, () => {})
	}
	// Ensure ephemeral track is included in the current playlist
	if (isEphemeral && !deck.playlist_tracks.includes(id)) {
		deck.playlist_tracks = [...deck.playlist_tracks, id]
	}

	// Auto-update broadcast if currently broadcasting.
	// Notify live listeners immediately via WebSocket, then persist to DB for late joiners.
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId && startReason !== 'broadcast_sync') {
		notifyBroadcastState(broadcastingChannelId)
		upsertRemoteBroadcast(broadcastingChannelId)
			.then(() => {
				log.log('broadcast_auto_updated', {
					channelId: broadcastingChannelId,
					trackId: id,
					startReason
				})
			})
			.catch((error) => {
				log.error('broadcast_auto_update_failed', {
					channelId: broadcastingChannelId,
					trackId: id,
					error: /** @type {Error} */ error.message
				})
			})
	}

	// Wait for Svelte to update the DOM (render the player element) before calling play
	await tick()
	const player = await waitForMediaPlayer(deckId)
	log.debug('playTrack calling play()', {deckId, foundPlayer: !!player})
	// Apply volume before playing to avoid audible flash at wrong volume
	if (player) {
		player.volume = deck.volume
		player.muted = deck.volume === 0 ? true : (deck.muted ?? false)
		play(deckId, player)
	}
}

/** Play a channel's tracks latest-first (or from trackId if given), replacing the deck's queue. */
export async function playChannel(deckId: number, {id, slug}: ChannelRef, trackId?: string) {
	log.log('play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	const d = getDeck(deckId)
	if (d) clearAutoRadio(d)
	await ensureTracksLoaded(slug)
	const tracks = newestFirst(channelTracks(slug))
	if (!tracks.length) {
		log.warn('play_channel_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	loadDeckView(deckId, {sources: [{channels: [slug]}]}, ids)
	capture('player:channel_play', {channel_slug: slug, shuffle: false})
	await playTrack(deckId, trackId ?? ids[0], null, 'play_channel')
}

/** Play a track in a fresh deck rather than the active one (e.g. "open in new deck"). */
export async function playTrackInNewDeck(trackId: string, slug?: string) {
	const deck = openDeck({compact: true, activate: true})
	if (slug && !tracksCollection.get(trackId)) {
		await ensureTracksLoaded(slug)
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
	await ensureTracksLoaded(slug)
	const tracks = channelTracks(slug)
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

/** Low-level queue setter. Clears deck.view when queue identity changes — callers that need
 *  view-backed queues should use loadDeckView() instead. */
export function setPlaylist(
	deckId: number,
	trackIds: string[],
	options: {title?: string; slug?: string} = {}
) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearQueueFilter(deck)
	const nextTitle = options.title?.trim() || undefined
	const nextSlug = options.slug !== undefined ? options.slug || undefined : deck.playlist_slug
	const tracksChanged = !sameStringArray(deck.playlist_tracks, trackIds)
	const titleChanged = deck.playlist_title !== nextTitle
	const slugChanged = options.slug !== undefined && deck.playlist_slug !== nextSlug
	const changed = tracksChanged || titleChanged || slugChanged

	if (tracksChanged) {
		deck.playlist_tracks = trackIds
		deck.playlist_tracks_shuffled = shuffleArray(trackIds)
	}
	if (titleChanged) deck.playlist_title = nextTitle
	if (slugChanged) deck.playlist_slug = nextSlug
	if (changed && deck.view !== undefined) deck.view = undefined
}

/** Load a queue into a deck from an explicit View.
 *  Uses setPlaylist() for queue setup, then restores deck.view
 *  with the normalized view — the only sanctioned view-aware queue load path. */
export function loadDeckView(
	deckId: number,
	view: View,
	trackIds: string[],
	options: {title?: string; slug?: string} = {}
) {
	const deck = getDeck(deckId)
	if (!deck) return
	setPlaylist(deckId, trackIds, options)
	deck.view = normalizeView(view)
}

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

// --- UI toggles: theme, panels, deck layout ---

/** Toggle play/pause; if the media element isn't mounted yet, marks playing and starts once it appears. */
export async function togglePlayPause(deckId: number) {
	const deck = getDeck(deckId)
	let player = getMediaPlayer(deckId)
	if (!player) {
		// Media element not in DOM yet (track data still loading from IDB).
		// Optimistically mark as playing and wait for the element to appear.
		if (deck) deck.is_playing = true
		setUserInitiatedPlay(deckId, true)
		player = await waitForMediaPlayer(deckId, 5000)
		if (!player) {
			if (deck) deck.is_playing = false
			log.warn('togglePlayPause: timed out waiting for media player')
			return
		}
		// User intent was to play — always play once the element is ready
		player.play()
		maybeBroadcastNotify()
		return
	}
	if (player.paused) {
		player.play()
	} else {
		player.pause()
	}
	maybeBroadcastNotify()
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

/** Record a seek position and notify broadcast listeners */
export function recordSeekPosition(deckId: number, seconds: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.seeked_at = new Date().toISOString()
	deck.seek_position = seconds
	maybeBroadcastNotify()
}

/** Apply a partial remote state update to a deck (broadcast sync) */
export function applyRemoteState(deckId: number, state: Partial<Deck>) {
	const deck = getDeck(deckId)
	if (!deck) return
	Object.assign(deck, state)
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

// --- Transport controls: play, pause, seek, next, prev ---

export function play(deckId: number, player?: MediaPlayer | null) {
	const deck = getDeck(deckId)
	if (!player) {
		const el = getMediaPlayer(deckId)
		if (el && 'paused' in el) player = el as MediaPlayer
	}
	if (!player) {
		log.warn('Media player not ready')
		return Promise.reject(new Error('Media player not ready'))
	}
	log.debug('play() check', player, 'paused?', player.paused)
	let result: Promise<void> | void
	try {
		result = player.play()
	} catch (error) {
		// YouTube API not ready yet (this.api is null) — swallow the sync throw
		log.warn('play() threw (player not ready):', (error as Error).message || error)
		return Promise.resolve()
	}
	if (result instanceof Promise) {
		return result
			.then(() => {
				log.log('play() succeeded')
				maybeBroadcastNotify()
			})
			.catch((error) => {
				if (deck) deck.is_playing = false
				log.warn('play() was prevented:', error.message || error)
			})
	}
	maybeBroadcastNotify()
	return Promise.resolve()
}

export function pause(player: MediaPlayer) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	player.pause()
	maybeBroadcastNotify()
}

export function togglePlay(player: MediaPlayer) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	if (player.paused) {
		// play() needs deckId but togglePlay gets a player ref directly from component
		// The component will use its own deckId-scoped play call
		player.play()
	} else {
		pause(player)
	}
}

export function seekTo(deckId: number, seconds: number) {
	const mediaEl = getMediaPlayer(deckId)
	if (!mediaEl) {
		log.warn('seekTo: no media element found')
		return
	}
	mediaEl.currentTime = seconds
	recordSeekPosition(deckId, seconds)
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
