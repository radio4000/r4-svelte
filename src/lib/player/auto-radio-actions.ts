import {appState} from '#lib/app-state.svelte.js'
import {leaveBroadcast} from '#lib/broadcast.js'
import {capture} from '#lib/analytics.js'
import {logger} from '#lib/logger.js'
import {ensureTracksLoaded} from '#lib/collections/tracks.js'
import {channelTracks} from '#lib/player/channel-tracks.js'
import {
	weeklyShuffle,
	playbackState,
	toAutoTracks,
	hasAutoRadioCoverage,
	epochFromTracks,
	type AutoTrack
} from '#lib/player/auto-radio.js'
import {findAutoDecksForChannel, findChannelDeck, pickAutoResyncDeck} from '#lib/deck.js'
import {getDeck, clearAutoRadio} from '#lib/decks.js'
import {processViewTracks} from '#lib/views.svelte.js'
import {serializeView, viewLabel, normalizeView, type View} from '#lib/views.js'
import type {Track, ChannelRef} from '#lib/types.js'
import {
	getMediaPlayer,
	loadDeckView,
	playChannel,
	playTrack,
	seekTo,
	setPlaylist,
	togglePlayPause
} from '#lib/api.js'

const log = logger.ns('api').seal()

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
	const filtered = processViewTracks(channelTracks(slug), view)
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
		const slugTracks = tracks ?? (await loadChannelTracks(slug))
		if (!hasAutoRadioCoverage(slugTracks)) return
		await joinAutoRadio(appState.active_deck_id, toAutoTracks(slugTracks), {
			sources: [{channels: [slug]}]
		})
	}
}

async function loadChannelTracks(slug: string): Promise<Track[]> {
	await ensureTracksLoaded(slug)
	return channelTracks(slug)
}
