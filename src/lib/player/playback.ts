/** Deck playback primitives. */
import {tick} from 'svelte'
import {appState} from '#lib/app-state.svelte.js'
import {leaveBroadcast} from '#lib/broadcast-teardown.js'
import {setUserInitiatedPlay} from '#lib/player/user-initiated-play.js'
import {logger} from '#lib/logger.js'
import {capture} from '#lib/analytics.js'
import {shuffleArray, isDbId} from '#lib/utils.js'
import {tracksCollection} from '#lib/collections/tracks.js'
import {loadChannelTracks} from '#lib/player/channel-tracks.js'
import {openDeck} from '#lib/player/open-deck.js'
import {capturePlayHistory} from '#lib/player/play-history.js'
import {getDeck, clearAutoRadio} from '#lib/decks.js'
import {normalizeView, type View} from '#lib/views.js'
import type {ChannelRef, Deck, PlayEndReason, PlayStartReason, Track} from '#lib/types.js'

const log = logger.ns('playback').seal()

function isNormalPlayStart(startReason: PlayStartReason): boolean {
	return (
		startReason === 'user_click_track' ||
		startReason === 'play_search' ||
		startReason === 'play_channel'
	)
}

/** New queues and queue edits drop the queue filter and its playback subset. */
export function clearQueueFilter(deck: Deck) {
	deck.queue_filter = undefined
	deck.playlist_tracks_filtered = undefined
}

function sameStringArray(a: string[], b: string[]): boolean {
	return a === b || (a.length === b.length && a.every((value, index) => value === b[index]))
}

/** The server's order: newest first, ties by id. Parses each date once, not per comparison. */
export function newestFirst<T extends {created_at: string; id: string}>(tracks: T[]): T[] {
	return tracks
		.map((track) => ({track, ms: new Date(track.created_at).getTime()}))
		.sort((a, b) => b.ms - a.ms || (a.track.id < b.track.id ? -1 : a.track.id > b.track.id ? 1 : 0))
		.map(({track}) => track)
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

// --- Track/channel playback ---

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
		deck = openDeck()
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

	let track: Track | undefined = tracksCollection.get(id)
	// After a reload the deck's channel loads behind the first render; next/prev can beat it
	if (!track && deck.playlist_slug) {
		const tracks = await loadChannelTracks(deck.playlist_slug).catch(() => [])
		track = tracks.find((t) => t.id === id)
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
		const queueChannel = (tracks: Track[]) => {
			if (getDeck(deckId)?.playlist_slug !== slug) return
			setPlaylist(
				deckId,
				newestFirst(tracks).map((t) => t.id)
			)
		}
		queueChannel([...tracksCollection.state.values()].filter((t) => t?.slug === slug))
		if (slug) loadChannelTracks(slug).then(queueChannel, () => {})
	}
	// Ensure ephemeral track is included in the current playlist
	if (isEphemeral && !deck.playlist_tracks.includes(id)) {
		deck.playlist_tracks = [...deck.playlist_tracks, id]
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
	const tracks = newestFirst(await loadChannelTracks(slug))
	if (!tracks.length) {
		log.warn('play_channel_no_tracks', {slug})
		return
	}
	const ids = tracks.map((t) => t.id)
	loadDeckView(deckId, {sources: [{channels: [slug]}]}, ids)
	capture('player:channel_play', {channel_slug: slug, shuffle: false})
	await playTrack(deckId, trackId ?? ids[0], null, 'play_channel')
}

// --- Queue loading ---

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

// --- Transport: play, pause, seek ---

/** Toggle play/pause; if the media element isn't mounted yet, marks playing and starts once it appears. */
export async function togglePlayPause(deckId: number) {
	const deck = getDeck(deckId)
	let player = getMediaPlayer(deckId)
	if (!player) {
		if (deck) deck.is_playing = true
		setUserInitiatedPlay(deckId, true)
		player = await waitForMediaPlayer(deckId, 5000)
		if (!player) {
			if (deck) deck.is_playing = false
			log.warn('togglePlayPause: timed out waiting for media player')
			return
		}
		player.play()
		return
	}
	if (player.paused) {
		player.play()
	} else {
		player.pause()
	}
}

/** Record a seek position. */
export function recordSeekPosition(deckId: number, seconds: number) {
	const deck = getDeck(deckId)
	if (!deck) return
	deck.seeked_at = new Date().toISOString()
	deck.seek_position = seconds
}

/** Apply a partial remote state update to a deck (broadcast sync) */
export function applyRemoteState(deckId: number, state: Partial<Deck>) {
	const deck = getDeck(deckId)
	if (!deck) return
	Object.assign(deck, state)
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
		log.warn('play() threw (player not ready):', (error as Error).message || error)
		return Promise.resolve()
	}
	if (result instanceof Promise) {
		return result
			.then(() => {
				log.log('play() succeeded')
			})
			.catch((error) => {
				if (deck) deck.is_playing = false
				log.warn('play() was prevented:', error.message || error)
			})
	}
	return Promise.resolve()
}

export function pause(player: MediaPlayer) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	player.pause()
}

export function togglePlay(player: MediaPlayer) {
	if (!player) {
		log.warn('Media player not ready')
		return
	}
	if (player.paused) {
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
