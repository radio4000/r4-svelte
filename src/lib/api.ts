import {tick} from 'svelte'
import {goto} from '$app/navigation'
import {appState, authStatus, addDeck} from '$lib/app-state.svelte'
import {LOCAL_STORAGE_KEYS, IDB_DATABASES} from '$lib/storage-keys'
import {
	leaveBroadcast,
	notifyBroadcastState,
	upsertRemoteBroadcast,
	getBroadcastingChannelId
} from '$lib/broadcast'
import {logger} from '$lib/logger'
import {capture} from '$lib/analytics'
import {sdk} from '@radio4000/sdk'
import {shuffleArray, isDbId, isMobileViewport, uuid} from '$lib/utils'
import {getActiveQueue, queueInsertManyAfter, queueNext, queuePrev} from '$lib/player/queue'
import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'

import type {Channel, ChannelRef, Deck, Track, PlayEndReason, PlayStartReason} from '$lib/types'
import {
	weeklyShuffle,
	playbackState,
	toAutoTracks,
	hasAutoRadioCoverage,
	epochFromTracks,
	type AutoTrack
} from '$lib/player/auto-radio'
import {
	findAutoDecksForChannel,
	findChannelDeck,
	pickAutoResyncDeck,
	sortedListeningDeckIds
} from '$lib/deck'
import {processViewTracks} from '$lib/views.svelte'
import {serializeView, viewLabel, normalizeView, type View} from '$lib/views'

const log = logger.ns('api').seal()

function getDeck(deckId: number): Deck | undefined {
	return appState.decks[deckId]
}

/** Return the active deck, creating a compact one when all decks are closed. */
export function ensureActiveDeck(): Deck {
	let deck = getDeck(appState.active_deck_id)
	if (!deck) {
		deck = addDeck()
		deck.compact = true
		appState.active_deck_id = deck.id
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

function sameStringArray(a: string[], b: string[]): boolean {
	return a === b || (a.length === b.length && a.every((value, index) => value === b[index]))
}

/** Notify broadcast listeners if currently broadcasting */
function maybeBroadcastNotify() {
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/** Clear a deck's auto-radio mode flags (not auto_radio_rotation_start — callers that need a
 *  full reset, like a normal-play mode switch, clear that separately). */
function clearAutoRadio(deck: Deck) {
	deck.auto_radio = undefined
	deck.auto_radio_drifted = undefined
}

/** Apply a change to a deck, or to every deck in its listening group if it's listening to a
 *  broadcast — the group of decks tuned to the same channel act as one unit for layout toggles. */
function applyToListeningGroup(deck: Deck, fn: (d: Deck) => void) {
	if (deck.listening_to_channel_id) {
		// Only one broadcast is listened to at a time, so all listening decks form one group.
		for (const id of sortedListeningDeckIds(appState.decks)) {
			const d = appState.decks[id]
			if (d) fn(d)
		}
	} else {
		fn(deck)
	}
}

/** Sort by a date field. Returns a comparator function. */
export function sortByDate(field: string, direction: 'asc' | 'desc' = 'desc') {
	return <T extends object>(a: T, b: T) => {
		const ta = new Date((a as Record<string, unknown>)[field] as string | number).getTime()
		const tb = new Date((b as Record<string, unknown>)[field] as string | number).getTime()
		return direction === 'desc' ? tb - ta : ta - tb
	}
}

/** Sort tracks by created_at descending (newest first) */
export const sortByNewest = sortByDate('created_at', 'desc')

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
	return (document.querySelector(`[data-deck="${deckId}"] youtube-video`) ||
		document.querySelector(`[data-deck="${deckId}"] soundcloud-player`) ||
		document.querySelector(
			`[data-deck="${deckId}"] audio.native-audio-player`
		)) as MediaPlayer | null
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
 *  Call on boot and after sign-in/out. */
export async function checkUser() {
	try {
		log.debug('checkUser')
		const {data: userData, error: userError} = await sdk.supabase.auth.getUser()
		if (userError || !userData?.user) {
			appState.channels = []
			appState.channel = undefined
			for (const deck of Object.values(appState.decks)) {
				deck.broadcasting_channel_id = undefined
			}
			return null
		}
		const user = userData.user

		const {data: channels, error: channelsError} = await sdk.channels.readUserChannels()
		if (channelsError) throw channelsError

		// Store IDs - collection handles fetching when needed
		appState.channels = channels.map((c) => c.id)
		// readUserChannels() queries the base `channels` table which lacks track_count.
		// Fetch from channels_with_tracks view to get the full object.
		if (channels[0]) {
			const {data: fullChannel} = await sdk.channels.readChannel(channels[0].slug)
			appState.channel = (fullChannel ?? channels[0]) as Channel | undefined
		} else {
			appState.channel = undefined
		}

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
		deck = addDeck()
		deck.compact = true
		deckId = deck.id
		appState.active_deck_id = deckId
		log.log('play_track_created_deck', {deckId})
	}

	// Switching from live/auto to a normal play action should reuse this deck and clear mode state.
	if (isNormalPlayStart(startReason)) {
		if (deck.listening_to_channel_id) leaveBroadcast(deckId)
		clearAutoRadio(deck)
		deck.auto_radio_rotation_start = undefined
	}

	const track = tracksCollection.get(id)
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

	// Record play history (skip for ephemeral tracks — no channel/slug)
	const previousTrackId = deck.playlist_track
	const previousPlayId = deck.play_id
	if (!isEphemeral && previousTrackId && previousTrackId !== id && endReason) {
		const msPlayed = Math.round(deck.ms_listened ?? 0)
		const endPosition = Math.round(deck.media_current_time ?? 0)
		capture('player:track_end', {
			play_id: previousPlayId,
			track_id: previousTrackId,
			channel_slug: deck.playlist_slug,
			end_reason: endReason,
			ms_played: msPlayed,
			end_position: endPosition
		})
	}
	if (!isEphemeral && startReason && track.slug) {
		// Keep accumulated listen time when the same track re-triggers — no track_end
		// was captured above, so resetting would silently drop it
		if (previousTrackId !== id) deck.ms_listened = 0
		const playId = uuid()
		deck.play_id = playId
		capture('player:track_play', {
			play_id: playId,
			track_id: track.id,
			channel_slug: track.slug,
			title: track.title,
			url: track.url,
			start_reason: startReason,
			shuffle: deck.shuffle,
			auto_radio: !!deck.auto_radio,
			broadcast: !!deck.listening_to_channel_id
		})
	}

	deck.playlist_track = id
	if (!isEphemeral) deck.playlist_slug = track.slug ?? undefined
	if (startReason !== 'broadcast_sync') {
		deck.track_played_at = new Date().toISOString()
		deck.seeked_at = deck.track_played_at
		deck.seek_position = 0
	}
	if (!isEphemeral && (!deck.playlist_tracks.length || !deck.playlist_tracks.includes(id))) {
		// Build playlist from tracks already loaded in collection (same channel/slug) only when needed.
		// Channel-page playback usually set this context already; rebuilding it on every click is slow.
		const channelTracks = [...tracksCollection.state.values()]
			.filter((t) => t?.slug === track.slug)
			.sort(sortByNewest)
		setPlaylist(
			deckId,
			channelTracks.map((t) => t.id)
		)
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
	const tracks = [...tracksCollection.state.values()]
		.filter((t) => t?.slug === slug)
		.sort(sortByNewest)
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
	const deck = addDeck()
	deck.compact = true
	appState.active_deck_id = deck.id
	if (slug && !tracksCollection.get(trackId)) {
		await ensureTracksLoaded(slug)
	}
	await playTrack(deck.id, trackId, null, 'user_click_track')
	// A newly opened extra deck loads paused — the user starts it explicitly.
	setUserInitiatedPlay(deck.id, false)
}

/** Play a channel in a fresh deck rather than the active one (e.g. "open in new deck"). */
export async function playChannelInNewDeck(channel: ChannelRef) {
	const deck = addDeck()
	deck.compact = true
	appState.active_deck_id = deck.id
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
	const tracks = [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
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

/** @param value 'light', 'dark', or undefined for system */
export function setTheme(value: string | undefined) {
	document.documentElement.classList.toggle('dark', value === 'dark')
	document.documentElement.classList.toggle('light', value === 'light')
	appState.theme = value
}

export function toggleTheme() {
	const cycle: Array<string | undefined> = [undefined, 'light', 'dark']
	setTheme(cycle[(cycle.indexOf(appState.theme) + 1) % cycle.length])
}

export function toggleQueuePanel(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.hide_queue_panel = !deck.hide_queue_panel
	maybeBroadcastNotify()
}

/** Toggle video player visibility. Listening decks (tuned to the same broadcast) toggle together. */
export function toggleVideo(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.hide_video_player
	applyToListeningGroup(deck, (d) => (d.hide_video_player = newValue))
	maybeBroadcastNotify()
}

/** Expand a deck fullscreen. Any other expanded deck returns to compact.
 *  Listening decks expand as a group, like the other layout toggles. */
export function expandDeck(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const groupIds = deck.listening_to_channel_id ? sortedListeningDeckIds(appState.decks) : [deck.id]
	for (const d of Object.values(appState.decks)) {
		const inGroup = groupIds.includes(d.id)
		if (inGroup) {
			d.expanded = true
			d.compact = false
			d.hide_video_player = false
		} else if (d.expanded) {
			d.expanded = false
			d.compact = true
		}
	}
}

export function toggleDeckCompact(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.compact
	// Mobile has no in-strip state: leaving compact goes straight to fullscreen
	if (!newValue && isMobileViewport()) {
		expandDeck(deckId)
		return
	}
	applyToListeningGroup(deck, (d) => {
		d.compact = newValue
		if (newValue && d.expanded) d.expanded = false
	})
}

export function togglePlayerExpanded(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	const newValue = !deck.expanded
	// Mobile has no in-strip state: expand fullscreen or collapse to compact
	if (isMobileViewport()) {
		if (newValue) expandDeck(deckId)
		else toggleDeckCompact(deckId)
		return
	}
	applyToListeningGroup(deck, (d) => {
		d.expanded = newValue
		if (newValue && d.compact) d.compact = false
		if (newValue && d.hide_video_player) d.hide_video_player = false
	})
}

/** Focus the search input if a deck is visible to make room for it, else navigate to /search. */
export function openSearch(event?: KeyboardEvent) {
	event?.preventDefault()
	const hasVisibleDeck = Object.values(appState.decks).some((d) => !d.compact)
	if (hasVisibleDeck) {
		const searchInput = document.querySelector('input[type="search"]')
		if (searchInput instanceof HTMLInputElement && searchInput.checkVisibility()) {
			searchInput.focus()
			return
		}
	}
	goto('/search')
}

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

export function eject(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearAllQueue(deckId)
	deck.hide_video_player = true
	deck.shuffle = false
	deck.is_playing = false
}

// --- Auto-radio ---

/**
 * Join auto-radio: deterministic "live radio" playback.
 * Computes the weekly shuffle and seeks to the current position so all
 * listeners hear the same track at the same second.
 * Pass a view to differentiate shuffles (e.g. tag subsets) and set the label.
 */
export async function joinAutoRadio(deckId: number, tracks: Track[], view?: View) {
	const autoTracks = toAutoTracks(tracks)
	if (!autoTracks.length) return

	capture('player:auto_radio_start', {view: view ? serializeView(view) : undefined})

	// Strip empty fields so callers don't need to guard
	if (view) view = normalizeView(view)

	const rotationStartUnix = epochFromTracks(autoTracks)
	const viewSeed = view ? serializeView(view) : undefined
	const {tracks: shuffled, totalDuration} = weeklyShuffle(
		autoTracks,
		rotationStartUnix,
		Date.now(),
		viewSeed
	)
	const snap = playbackState(shuffled, totalDuration, rotationStartUnix, Date.now())
	if (!snap) return

	// Pre-set the filtered playlist so playTrack doesn't briefly load all channel tracks
	const label = view ? viewLabel(view) : undefined
	const ids = shuffled.map((t) => t.id)
	if (view) loadDeckView(deckId, view, ids, {title: label})
	else setPlaylist(deckId, ids, {title: label})
	await playTrack(deckId, snap.currentTrack.id, null, 'play_channel')
	// playTrack → setPlaylist clears deck.view; restore it so resyncAutoRadio can run
	if (appState.decks[deckId]) {
		appState.decks[deckId].auto_radio = true
		appState.decks[deckId].auto_radio_drifted = false
		appState.decks[deckId].auto_radio_rotation_start = rotationStartUnix
		appState.decks[deckId].auto_radio_synced_at = Date.now()
		appState.decks[deckId].speed = 1
		if (view) appState.decks[deckId].view = view
	}
	const mediaElement = getMediaPlayer(deckId)
	if (mediaElement && 'playbackRate' in mediaElement) mediaElement.playbackRate = 1

	await seekToAutoRadioOffset(deckId, shuffled, totalDuration, rotationStartUnix)
}

/** Wait for the media player to be ready, then seek to the current auto-radio offset. */
async function seekToAutoRadioOffset(
	deckId: number,
	shuffled: AutoTrack[],
	totalDuration: number,
	rotationStartUnix: number
) {
	const deadline = performance.now() + 8000
	while (performance.now() < deadline) {
		const el = getMediaPlayer(deckId)
		const hasDuration = el && Number.isFinite(el.duration) && el.duration > 0
		const hasStarted = el && el.currentTime > 0
		if (hasDuration || hasStarted) {
			const freshSnap = playbackState(shuffled, totalDuration, rotationStartUnix, Date.now())
			if (freshSnap) seekTo(deckId, freshSnap.offsetSeconds)
			// SoundCloud may process seeks asynchronously and silently drop the first one
			// while still buffering. Retry once after a short wait with a freshly computed offset.
			await new Promise((r) => setTimeout(r, 350))
			const retrySnap = playbackState(shuffled, totalDuration, rotationStartUnix, Date.now())
			if (retrySnap) seekTo(deckId, retrySnap.offsetSeconds)
			break
		}
		await new Promise((r) => setTimeout(r, 150))
	}
}

/**
 * Resync the deck to the current auto-radio position.
 * Uses the stored rotation params to recompute the expected track + offset,
 * navigating to the right track if needed, then seeking.
 */
export async function resyncAutoRadio(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck?.auto_radio || !deck.view || deck.auto_radio_rotation_start == null) return

	const view = deck.view
	const slug = view.sources[0]?.channels?.[0]
	if (!slug) return
	const rotationStartUnix = deck.auto_radio_rotation_start

	// Re-filter from local collection using the same view as joinAutoRadio
	const channelTracks = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
	const filtered = processViewTracks(channelTracks, view)
	const autoTracks = toAutoTracks(filtered)
	if (!autoTracks.length) return

	const viewSeed = serializeView(view)
	const {tracks: shuffled, totalDuration} = weeklyShuffle(
		autoTracks,
		rotationStartUnix,
		Date.now(),
		viewSeed
	)
	const snap = playbackState(shuffled, totalDuration, rotationStartUnix, Date.now())
	if (!snap) return
	const label = viewLabel(view) || undefined

	const ids = shuffled.map((t) => t.id)
	const isSameTrack = deck.playlist_track === snap.currentTrack.id
	if (!isSameTrack) {
		loadDeckView(deckId, view, ids, {title: label, slug})
		await playTrack(deckId, snap.currentTrack.id, null, 'play_channel')
	}

	// Restore auto-radio flags after loadDeckView/playTrack
	const d = getDeck(deckId)
	if (d) {
		d.auto_radio = true
		d.auto_radio_drifted = false
		d.auto_radio_rotation_start = rotationStartUnix
		d.auto_radio_synced_at = Date.now()
		if (label) d.playlist_title = label
	}

	if (isSameTrack) {
		await seekToAutoRadioOffset(deckId, shuffled, totalDuration, rotationStartUnix)
		// Ensure playing — user expects the button to always start playback
		if (!getDeck(deckId)?.is_playing) togglePlayPause(deckId)
	} else {
		await seekToAutoRadioOffset(deckId, shuffled, totalDuration, rotationStartUnix)
	}
}

// Resync drifted auto-radio decks on tab/screen foreground — mirrors broadcast.js's
// resumeBroadcastState (same rationale: backgrounded mobile tabs stall local timers,
// and platform bugs like iOS's background play() failures can silently stall
// playback). Without this, a drifted deck sits out of sync until the user notices
// the manual "resync" affordance and taps it.
if (typeof document !== 'undefined') {
	const resumeAutoRadio = () => {
		if (document.visibilityState !== 'visible') return
		for (const [id, deck] of Object.entries(appState.decks)) {
			if (deck.auto_radio && deck.auto_radio_drifted) {
				resyncAutoRadio(Number(id)).catch((error) =>
					log.warn('resume_auto_radio_failed', (error as Error).message)
				)
			}
		}
	}
	document.addEventListener('visibilitychange', resumeAutoRadio)
	window.addEventListener('pageshow', resumeAutoRadio)
}

/** Exit auto-radio, keeping the queue and current track playing — the deck
 *  becomes a normal deck so prev/next work again. */
export function leaveAutoRadio(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck?.auto_radio) return
	clearAutoRadio(deck)
	deck.auto_radio_rotation_start = undefined
	deck.auto_radio_synced_at = undefined
	capture('player:auto_radio_leave')
	log.log('leave_auto_radio', {deckId})
}

/** Join auto-radio for the channel the deck is currently playing — the way back
 *  after {@link leaveAutoRadio}. Reuses the deck's view when it targets the same
 *  channel (e.g. a tag-filtered rotation), else joins the full channel. */
export async function rejoinAutoRadio(deckId: number) {
	const deck = getDeck(deckId)
	const slug = deck?.playlist_slug
	if (!deck || !slug || deck.auto_radio || deck.listening_to_channel_id) return
	const view =
		deck.view?.sources[0]?.channels?.[0] === slug ? deck.view : {sources: [{channels: [slug]}]}
	const filtered = processViewTracks(await loadChannelTracks(slug), view)
	if (!hasAutoRadioCoverage(filtered)) return
	await joinAutoRadio(deckId, filtered, view)
}

// --- Channel entry points ("tap play") ---

/**
 * Default "tap play" for a channel. Starts live auto-radio when the channel has
 * enough duration data, otherwise falls back to latest-first playback.
 * Always targets the active deck — auto-radio is keyed by the active deck
 * (see {@link toggleChannelAutoRadio}), so there is no deck to thread through.
 */
export async function playChannelAuto(channel: ChannelRef) {
	const tracks = await loadChannelTracks(channel.slug)
	if (hasAutoRadioCoverage(tracks)) {
		await toggleChannelAutoRadio(channel.slug, tracks)
	} else {
		await playChannel(appState.active_deck_id, channel)
	}
}

/**
 * Primary "tap play" for a channel — keyed by the channel, not a deck. Resolves the
 * deck holding the channel via {@link findChannelDeck} (the same helper surfaces use
 * for display), so the deck shown and the deck acted on are always the same one.
 * If a deck already holds this channel: focus it, then resync a drifted auto-radio
 * else pause/resume. Otherwise start fresh on the active deck from `trackId`, or
 * smartly via {@link playChannelAuto} (auto-radio if the channel has coverage, else
 * latest-first).
 */
export async function toggleChannelPlay(channel: ChannelRef, trackId?: string) {
	const deck = findChannelDeck(appState.decks, appState.active_deck_id, channel.slug)
	if (deck) {
		// Focus the resolved deck so global controls (spacebar, player surface) follow
		// the deck the user just acted on — avoids a second silent stream of the channel.
		appState.active_deck_id = deck.id
		// Already this channel: resync a drifted auto-radio, else pause/resume.
		if (deck.auto_radio && deck.auto_radio_drifted) await resyncAutoRadio(deck.id)
		else togglePlayPause(deck.id)
		return
	}
	// Fresh start on the active deck. leaveBroadcast is required for the auto path —
	// joinAutoRadio never leaves a broadcast. The playChannel path leaves it again
	// internally; the double-call is harmless.
	const deckId = appState.active_deck_id
	leaveBroadcast(deckId)
	if (trackId) await playChannel(deckId, channel, trackId)
	else await playChannelAuto(channel)
}

/** Start (or resync a drifted) auto-radio for a channel. Reuses an existing auto-radio deck
 *  for this channel if one exists, else joins fresh on the active deck. */
export async function toggleChannelAutoRadio(slug: string, tracks?: Track[]) {
	const autoDecks = findAutoDecksForChannel(appState.decks, slug)
	const resyncId = pickAutoResyncDeck(appState.decks, appState.active_deck_id, slug, autoDecks)
	if (autoDecks.length && resyncId) {
		await resyncAutoRadio(resyncId)
	} else {
		const channelTracks = tracks ?? (await loadChannelTracks(slug))
		if (!hasAutoRadioCoverage(channelTracks)) return
		await joinAutoRadio(appState.active_deck_id, toAutoTracks(channelTracks), {
			sources: [{channels: [slug]}]
		})
	}
}

async function loadChannelTracks(slug: string): Promise<Track[]> {
	await ensureTracksLoaded(slug)
	return [...tracksCollection.state.values()].filter((t) => t.slug === slug)
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
