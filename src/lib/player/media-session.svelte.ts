/**
 * Media Session API — lock screen / notification controls, and the stability
 * dance needed to keep them ours. YouTube's iframe claims the session for
 * itself whenever its playback starts, silently overwriting our
 * metadata/handlers on Android. Can't be prevented — so metadata + handlers
 * are reasserted on every real "playing" event (the player calls `reassert()`
 * from its playing handler) and on a light recurring interval while playing.
 *
 * Rune factory (same pattern as deck-display.svelte.ts): call once during
 * component init; effects bind to the component's lifecycle.
 *
 * Platform gotchas:
 * - Chrome may bind action-handling authority to the frame owning the playing
 *   media — for YouTube that's their cross-origin iframe, which we can't reach
 *   into. Unconfirmed. audio-keepalive.js plays faint audio in our frame on
 *   Android, which may also route lock-screen controls to us.
 * - Firefox has historically not implemented the Media Session API — nothing
 *   to fix on our end. Re-check on new releases.
 */

import {untrack} from 'svelte'
import {appState} from '#lib/app-state.svelte.js'
import {play, pause, next, previous, type MediaPlayer} from '#lib/api.js'
import {trackImageUrl} from '#lib/utils.js'
import type {Channel, Track} from '#lib/types.js'

// The Media Session API is global to the page. Track which deck last installed
// handlers so an inactive deck cannot clear the active deck's controls.
let mediaSessionOwner: number | undefined

export interface MediaSessionDeps {
	readonly mediaElement: MediaPlayer | undefined
	readonly provider: string | null
	readonly displayTrack: Track | undefined
	readonly displayChannel: Channel | undefined
	/** Queue capabilities — derived by the player for its buttons; passed in so
	 *  the OS controls can't drift from the in-app ones. */
	readonly canPrev: boolean
	readonly canNext: boolean
}

export function createMediaSession(deckId: number, deps: MediaSessionDeps) {
	const deck = $derived(appState.decks[deckId])
	const isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))

	// With multiple decks, only the active one drives the OS media session.
	function isActiveMediaSessionDeck() {
		const deckCount = Object.keys(appState.decks).length
		return deckCount <= 1 || appState.active_deck_id === deckId
	}

	let appliedTrackId: string | undefined
	let appliedMetadata: MediaMetadata | undefined

	/** (Re)apply Media Session metadata + action handlers from current state.
	 *  Safe to call repeatedly — reassertion preserves the existing MediaMetadata
	 *  object unless the track changes or another frame (notably YouTube)
	 *  replaces it, avoiding lock-screen artwork churn. */
	function reassert() {
		if (!('mediaSession' in navigator)) return
		if (!isActiveMediaSessionDeck()) return
		mediaSessionOwner = deckId

		const t = deps.displayTrack
		if (!t) {
			navigator.mediaSession.metadata = null
			appliedTrackId = undefined
			appliedMetadata = undefined
			navigator.mediaSession.setActionHandler('play', null)
			navigator.mediaSession.setActionHandler('pause', null)
			navigator.mediaSession.setActionHandler('previoustrack', null)
			navigator.mediaSession.setActionHandler('nexttrack', null)
			mediaSessionOwner = undefined
			return
		}
		const ch = deps.displayChannel

		if (appliedTrackId !== t.id || navigator.mediaSession.metadata !== appliedMetadata) {
			const artwork =
				deps.provider === 'youtube' && t.media_id
					? [{src: trackImageUrl(t.media_id), sizes: '480x360', type: 'image/jpeg'}]
					: []
			const metadata = new MediaMetadata({
				title: t.title ?? '',
				artist: ch ? `${ch.name} (@${ch.slug})` : '',
				album: t.description ?? '',
				artwork
			})
			navigator.mediaSession.metadata = metadata
			appliedTrackId = t.id
			appliedMetadata = metadata
		}
		// Read outside the metadata/handlers effect's tracking — play/pause toggles
		// shouldn't retrigger a full metadata + handler rebuild (see playbackState effect).
		navigator.mediaSession.playbackState = untrack(() => deck?.is_playing) ? 'playing' : 'paused'

		// Always register play/pause — passing null removes the button on Android
		navigator.mediaSession.setActionHandler('play', () => {
			if (deps.mediaElement) play(deckId, deps.mediaElement)
		})
		navigator.mediaSession.setActionHandler('pause', () => {
			if (deps.mediaElement) pause(deps.mediaElement)
		})
		// Skipping only makes sense for a normal queue — the in-app UI hides prev/next
		// the same way while listening to a broadcast (can't skip someone else's track)
		// or in auto-radio (skipping breaks the deterministic-schedule contract).
		const allowSkip = !isListeningToBroadcast && !deck?.auto_radio
		navigator.mediaSession.setActionHandler(
			'previoustrack',
			allowSkip && deps.canPrev ? () => previous(deckId, 'user_prev') : null
		)
		navigator.mediaSession.setActionHandler(
			'nexttrack',
			allowSkip && deps.canNext ? () => next(deckId, 'user_next') : null
		)
	}

	// Metadata + handlers — depends on track/channel/mode, not on is_playing (read
	// via untrack() above) so a play/pause toggle doesn't tear down and rebuild.
	$effect(() => {
		reassert()
		return () => {
			if (!('mediaSession' in navigator) || mediaSessionOwner !== deckId) return
			navigator.mediaSession.setActionHandler('play', null)
			navigator.mediaSession.setActionHandler('pause', null)
			navigator.mediaSession.setActionHandler('previoustrack', null)
			navigator.mediaSession.setActionHandler('nexttrack', null)
			mediaSessionOwner = undefined
		}
	})

	// playbackState flips on every play/pause without needing a full rebuild. Also
	// keeps a light recurring reassert while playing — the player's playing handler
	// covers the moment playback starts; this covers YouTube's iframe reclaiming
	// the session again later.
	$effect(() => {
		if (!('mediaSession' in navigator) || !deps.displayTrack) return
		if (!isActiveMediaSessionDeck()) return
		navigator.mediaSession.playbackState = deck?.is_playing ? 'playing' : 'paused'
		if (!deck?.is_playing) return
		const interval = setInterval(reassert, 4000)
		return () => clearInterval(interval)
	})

	// A suspended tab may miss the recurring reassertion. Restore controls on
	// resume even when the provider reported a pause while the screen was locked.
	$effect(() => {
		const resume = () => {
			if (document.visibilityState === 'visible') reassert()
		}
		document.addEventListener('visibilitychange', resume)
		window.addEventListener('pageshow', resume)
		return () => {
			document.removeEventListener('visibilitychange', resume)
			window.removeEventListener('pageshow', resume)
		}
	})

	return {reassert}
}
