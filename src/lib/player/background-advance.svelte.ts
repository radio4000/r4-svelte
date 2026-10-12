/**
 * Background advance — auto-advance while the tab is hidden or the screen is
 * locked. Reported on all mobile browsers: a track plays to its end, then the
 * next one never starts. Once media has ended, nothing on the page is playing,
 * and mobile browsers release audio focus and refuse to start new media from a
 * hidden page without a tap (the YouTube iframe keeps playing a video, but
 * won't start the next after `ended`).
 *
 * So while hidden, advance a little before the end, while the current media is
 * still playing: the provider swaps sources without the page ever going silent.
 * Visible pages keep the normal `ended` path. Unconfirmed on-device.
 *
 * The threshold covers sparse timeupdates while hidden (provider progress can
 * arrive ~1s apart). The player ignores the old track's late `ended` via
 * `advancedRecently()` so it doesn't skip a track.
 *
 * Skipped for broadcast/auto-radio decks — they follow the broadcaster/clock.
 */

import {appState} from '$lib/app-state.svelte'
import {next, type MediaPlayer} from '$lib/api'
import {logger} from '$lib/logger'

const log = logger.ns('background-advance').seal()

const SECONDS_BEFORE_END = 3
const ENDED_GRACE_MS = 5000

export interface BackgroundAdvanceDeps {
	readonly mediaElement: MediaPlayer | undefined
}

export function createBackgroundAdvance(deckId: number, deps: BackgroundAdvanceDeps) {
	const deck = $derived(appState.decks[deckId])
	let advancedAt = 0

	$effect(() => {
		const el = deps.mediaElement
		const trackId = deck?.playlist_track
		if (!el || !trackId || deck?.listening_to_channel_id || deck?.auto_radio) return
		let advanced = false
		const onTime = () => {
			if (advanced || document.visibilityState !== 'hidden' || !deck?.is_playing) return
			if (deck.playlist_track !== trackId) return
			const {currentTime, duration} = el
			if (!Number.isFinite(duration) || duration <= 0 || !(currentTime > 0)) return
			const remaining = (duration - currentTime) / (deck.speed || 1)
			if (remaining > SECONDS_BEFORE_END) return
			advanced = true
			advancedAt = Date.now()
			log.log('advancing before end', {deckId, trackId, remaining})
			next(deckId, 'track_completed')
		}
		el.addEventListener('timeupdate', onTime)
		return () => el.removeEventListener('timeupdate', onTime)
	})

	return {
		/** True right after an early advance: the previous track's `ended` may still arrive. */
		advancedRecently: () => Date.now() - advancedAt < ENDED_GRACE_MS
	}
}
