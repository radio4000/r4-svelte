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
import {shuffleArray, isDbId, uuid} from '$lib/utils'
import {
	getActiveQueue,
	queueInsertManyAfter,
	queueNext,
	queuePrev,
	queueRemove,
	queueShuffleKeepCurrent,
	queueRotate
} from '$lib/player/queue'
import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'

import type {Channel, Deck, Track, PlayEndReason, PlayStartReason} from '$lib/types'
import {
	weeklyShuffle,
	playbackState,
	toAutoTracks,
	hasAutoRadioCoverage,
	epochFromTracks,
	type AutoTrack
} from '$lib/player/auto-radio'
import {findAutoDecksForChannel, pickAutoResyncDeck} from '$lib/deck'
import {processViewTracks} from '$lib/views.svelte'
import {serializeView, viewLabel, normalizeView, type View} from '$lib/views'

const log = logger.ns('api').seal()

function getDeck(deckId: number): Deck | undefined {
	return appState.decks[deckId]
}

/** Notify broadcast listeners if currently broadcasting */
function maybeBroadcastNotify() {
	const broadcastingChannelId = getBroadcastingChannelId()
	if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
}

/** Sort by a date field. Returns a comparator function. */
export function sortByDate(field: string, direction: 'asc' | 'desc' = 'desc') {
	return (a: Record<string, unknown>, b: Record<string, unknown>) => {
		const ta = new Date(a[field] as string | number).getTime()
		const tb = new Date(b[field] as string | number).getTime()
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

type MediaPlayer = HTMLElement & {
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

/** Wait until a media element exists for a deck. */
async function waitForMediaPlayer(deckId: number, timeoutMs = 3000): Promise<MediaPlayer | null> {
	const deadline = performance.now() + timeoutMs
	while (performance.now() < deadline) {
		const player = getMediaPlayer(deckId)
		if (player && 'paused' in player) return player as MediaPlayer
		await new Promise((r) => requestAnimationFrame(r))
	}
	return null
}

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

	// Build playlist from tracks already loaded in collection (same channel/slug)
	// Skip for ephemeral tracks — caller manages the playlist via setPlaylist()
	const channelTracks = isEphemeral
		? []
		: [...tracksCollection.state.values()].filter((t) => t?.slug === track.slug).sort(sortByNewest)
	const ids = channelTracks.map((t) => t.id)

	// Record play history (skip for ephemeral tracks — no channel/slug)
	const previousTrackId = deck.playlist_track
	const previousPlayId = deck.play_id
	if (!isEphemeral && previousTrackId && previousTrackId !== id && endReason) {
		const mediaController = document.querySelector(`media-controller#r5-deck-${deckId}`)
		const actualPlayTime = mediaController?.getAttribute('mediacurrenttime')
		const msPlayed = actualPlayTime ? Math.round(Number.parseFloat(actualPlayTime) * 1000) : 0
		capture('player:track_end', {
			play_id: previousPlayId,
			track_id: previousTrackId,
			channel_slug: deck.playlist_slug,
			end_reason: endReason,
			ms_played: msPlayed
		})
	}
	if (!isEphemeral && startReason && track.slug) {
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
	if (!isEphemeral && (!deck.playlist_tracks.length || !deck.playlist_tracks.includes(id)))
		await setPlaylist(deckId, ids)
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

export async function playChannel(
	deckId: number,
	{id, slug}: {id: string; slug: string},
	trackId?: string
) {
	log.log('play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	const d = getDeck(deckId)
	if (d) {
		d.auto_radio = undefined
		d.auto_radio_drifted = undefined
	}
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()]
		.filter((t) => t?.slug === slug)
		.sort(sortByNewest)
	if (!tracks.length) {
		log.warn('play_channel_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	await setPlaylist(deckId, ids)
	capture('player:channel_play', {channel_slug: slug, shuffle: false})
	await playTrack(deckId, trackId ?? ids[0], null, 'play_channel')
}

/**
 * @param {string} trackId
 * @param {string} [slug]
 */
export async function playTrackInNewDeck(trackId, slug) {
	const deck = addDeck()
	appState.active_deck_id = deck.id
	if (slug && !tracksCollection.get(trackId)) {
		await ensureTracksLoaded(slug)
	}
	await playTrack(deck.id, trackId, null, 'user_click_track')
}

/**
 * @param {{id: string, slug: string}} channel
 * @param {string} [trackId]
 */
export async function playChannelInNewDeck(channel, trackId) {
	const deck = addDeck()
	appState.active_deck_id = deck.id
	await playChannel(deck.id, channel, trackId)
}

/**
 * Play channel starting from random track with shuffle enabled
 * @param {number} deckId
 * @param {{id: string, slug: string}} channel
 */
export async function shufflePlayChannel(deckId, {id, slug}) {
	log.log('shuffle_play_channel', {deckId, id, slug})
	leaveBroadcast(deckId)
	const d = getDeck(deckId)
	if (d) {
		d.auto_radio = undefined
		d.auto_radio_drifted = undefined
	}
	await ensureTracksLoaded(slug)
	const tracks = [...tracksCollection.state.values()].filter((t) => t?.slug === slug)
	if (!tracks.length) {
		log.warn('shuffle_play_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	const randomIndex = Math.floor(Math.random() * ids.length)
	await setPlaylist(deckId, ids)
	const deck = getDeck(deckId)
	if (deck) deck.shuffle = true
	capture('player:channel_play', {channel_slug: slug, shuffle: true})
	await playTrack(deckId, ids[randomIndex], null, 'play_channel')
}

export function setPlaylist(
	deckId: number,
	trackIds: string[],
	options: {title?: string; slug?: string} = {}
) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.playlist_tracks = trackIds
	deck.playlist_tracks_shuffled = shuffleArray(trackIds)
	const nextTitle = options.title?.trim()
	deck.playlist_title = nextTitle || undefined
	if (options.slug !== undefined) deck.playlist_slug = options.slug || undefined
}

/**
 * @param {number} deckId
 * @param {string[]} trackIds
 */
export function addToPlaylist(deckId, trackIds) {
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
	log.log('addToPlaylist', {
		deckId,
		added: trackIds.length,
		before,
		after: deck.playlist_tracks.length
	})
}

/**
 * Queue track(s) to play after the current track
 * @param {number} deckId
 * @param {string | string[]} trackIds
 */
export function playNext(deckId, trackIds) {
	const deck = getDeck(deckId)
	if (!deck) return
	const ids = Array.isArray(trackIds) ? trackIds : [trackIds]
	const currentId = deck.playlist_track
	if (!currentId) {
		deck.playlist_tracks = ids
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
	log.log('play_next', {deckId, ids, after: currentId})
}

/**
 * Remove track from queue
 * @param {number} deckId
 * @param {string} trackId
 */
export function removeFromQueue(deckId, trackId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.playlist_tracks = queueRemove(deck.playlist_tracks, trackId)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueRemove(deck.playlist_tracks_shuffled, trackId)
	}
	log.log('remove_from_queue', {deckId, trackId})
}

export function toggleTheme() {
	const isDark = document.documentElement.classList.contains('dark')
	document.documentElement.classList.toggle('dark', !isDark)
	document.documentElement.classList.toggle('light', isDark)
	appState.theme = isDark ? 'light' : 'dark'
}

/** @param {number} deckId */
export function toggleQueuePanel(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.hide_queue_panel = !deck.hide_queue_panel
	maybeBroadcastNotify()
}

/** @param {number} deckId */
export function toggleVideo(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.hide_video_player = !deck.hide_video_player
	maybeBroadcastNotify()
}

/** @param {number} deckId */
export function toggleDeckCompact(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.compact = !deck.compact
	if (deck.compact && deck.expanded) deck.expanded = false
}

/** @param {number} deckId */
export function togglePlayerExpanded(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.expanded = !deck.expanded
	if (deck.expanded && deck.compact) deck.compact = false
	if (deck.expanded && deck.hide_video_player) {
		deck.hide_video_player = false
	}
}

/** @param {KeyboardEvent} [event] */
export function openSearch(event) {
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

/** @param {number} deckId */
export async function togglePlayPause(deckId) {
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

/**
 * Play from this track to end of list
 * @param {number} deckId
 * @param {string} trackId
 */
export function playFromHere(deckId, trackId) {
	const deck = getDeck(deckId)
	if (!deck) return
	const idx = deck.playlist_tracks.indexOf(trackId)
	if (idx === -1) return
	const fromHere = deck.playlist_tracks.slice(idx)
	deck.playlist_tracks = fromHere
	deck.playlist_tracks_shuffled = shuffleArray(fromHere)
	playTrack(deckId, trackId, null, 'user_click_track')
	log.log('play_from_here', {deckId, trackId, remaining: fromHere.length})
}

/**
 * Clear the queue but keep current track
 * @param {number} deckId
 */
export function clearQueue(deckId) {
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
	log.log('clear_queue', {deckId, kept: current})
}

/** Clear entire queue including current track */
export function clearAllQueue(deckId: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.playlist_tracks = []
	deck.playlist_tracks_shuffled = []
	deck.playlist_track = undefined
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

/**
 * Toggle shuffle mode on/off
 * @param {number} deckId
 */
export function toggleShuffle(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.shuffle = !deck.shuffle
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = shuffleArray(deck.playlist_tracks || [])
	}
}

/**
 * Shuffle remaining tracks in place
 * @param {number} deckId
 */
export function shuffleRemaining(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	const current = deck.playlist_track
	if (!current) return
	deck.playlist_tracks = queueShuffleKeepCurrent(deck.playlist_tracks, current)
	deck.playlist_tracks_shuffled = queueShuffleKeepCurrent(deck.playlist_tracks_shuffled, current)
	log.log('shuffle_remaining', {deckId, current})
}

/**
 * Rotate queue: move played tracks to end
 * @param {number} deckId
 */
export function rotateQueue(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	const current = deck.playlist_track
	if (!current) return
	deck.playlist_tracks = queueRotate(deck.playlist_tracks, current)
	if (deck.shuffle) {
		deck.playlist_tracks_shuffled = queueRotate(deck.playlist_tracks_shuffled, current)
	}
	log.log('rotate_queue', {deckId, current})
}

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

/**
 * @param {number} deckId
 * @param {number} seconds
 */
export function seekTo(deckId, seconds) {
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

/** @param {number} deckId */
export function eject(deckId) {
	const deck = getDeck(deckId)
	if (!deck) return
	clearAllQueue(deckId)
	deck.hide_video_player = true
	deck.shuffle = false
	deck.is_playing = false
}

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
	setPlaylist(
		deckId,
		shuffled.map((t) => t.id),
		{title: label}
	)
	await playTrack(deckId, snap.currentTrack.id, null, 'play_channel')
	if (appState.decks[deckId]) {
		appState.decks[deckId].auto_radio = true
		appState.decks[deckId].auto_radio_drifted = false
		appState.decks[deckId].view = view
		appState.decks[deckId].auto_radio_rotation_start = rotationStartUnix
	}

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

	const isSameTrack = deck.playlist_track === snap.currentTrack.id
	if (!isSameTrack) {
		setPlaylist(
			deckId,
			shuffled.map((t) => t.id),
			{title: label, slug}
		)
		await playTrack(deckId, snap.currentTrack.id, null, 'play_channel')
	}

	// Restore auto-radio flags after setPlaylist/playTrack
	const d = getDeck(deckId)
	if (d) {
		d.auto_radio = true
		d.auto_radio_drifted = false
		d.auto_radio_rotation_start = rotationStartUnix
		d.view = view
		if (label) d.playlist_title = label
	}

	if (isSameTrack) {
		seekTo(deckId, snap.offsetSeconds)
		// Ensure playing — user expects the button to always start playback
		if (!getDeck(deckId)?.is_playing) togglePlayPause(deckId)
	} else {
		await seekToAutoRadioOffset(deckId, shuffled, totalDuration, rotationStartUnix)
	}
}

export async function toggleChannelAutoRadio(slug: string, tracks?: Track[]) {
	const autoDecks = findAutoDecksForChannel(appState.decks, slug)
	const resyncId = pickAutoResyncDeck(appState.decks, appState.active_deck_id, slug, autoDecks)
	if (autoDecks.length && resyncId) {
		resyncAutoRadio(resyncId)
	} else {
		const channelTracks = tracks ?? (await loadChannelTracks(slug))
		if (!hasAutoRadioCoverage(channelTracks)) return
		joinAutoRadio(appState.active_deck_id, toAutoTracks(channelTracks), {
			sources: [{channels: [slug]}]
		})
	}
}

async function loadChannelTracks(slug: string): Promise<Track[]> {
	await ensureTracksLoaded(slug)
	return [...tracksCollection.state.values()].filter((t) => t.slug === slug)
}

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
