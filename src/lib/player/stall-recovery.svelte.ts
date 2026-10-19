/**
 * Stall recovery — platform playback bugs can silently drop playback while a
 * tab is backgrounded or the mobile screen is locked (reported on
 * Android/YouTube: video stops loading while locked without reporting
 * `paused`, and briefly unlocking kicks it back into motion). Two lines of
 * defense, both calling the same nudge (a small real seek, then play;
 * same-position seeks are ignored by the provider wrappers):
 *
 * 1. visibilitychange/pageshow — on foreground, recover a paused player
 *    immediately, or an observably stuck one after a short observation.
 * 2. setInterval watchdog — can in principle self-heal while still
 *    backgrounded: Chromium exempts audio-playing tabs from background timer
 *    throttling. Unconfirmed on-device. Requires two consecutive stalled
 *    samples.
 *
 * Skipped entirely for broadcast/auto-radio decks — those self-heal on
 * foreground themselves (resumeBroadcastState in broadcast.js; auto-resync
 * next to resyncAutoRadio in api.ts).
 *
 * Rune factory (same pattern as deck-display.svelte.ts): call once during
 * component init; effects bind to the component's lifecycle.
 *
 * Platform gotchas:
 * - requestAnimationFrame is fully suspended while document.hidden — zero
 *   callbacks, including a locked screen. Anything polling on the playback
 *   path must use setTimeout/setInterval (waitForMediaPlayer in api.ts was
 *   fixed for this; everything here uses timers for the same reason).
 * - iOS Safari: .play() can silently fail from a backgrounded/locked context —
 *   WebKit bug 173332 (fixed 2019, reintroduced iOS 15+). No workaround known.
 *   iOS also has no Wake Lock API, so wake-lock.js is a no-op there.
 * - Android battery restrictions can suspend the browser process entirely. JS
 *   can't detect or repair that, and a stall alone can't identify battery
 *   policy as the cause, so there's no automatic battery-settings warning.
 */

import {onDestroy} from 'svelte'
import {appState} from '#lib/app-state.svelte.js'
import {play, type MediaPlayer} from '#lib/api.js'
import {logger} from '#lib/logger.js'

const log = logger.ns('stall-recovery').seal()

export interface StallRecoveryDeps {
	readonly mediaElement: (MediaPlayer & {readyState?: number}) | undefined
	/** Re-apply the deck's volume/mute to the media element (see nudge below). */
	readonly restoreVolume: () => void
}

export function createStallRecovery(deckId: number, deps: StallRecoveryDeps) {
	const deck = $derived(appState.decks[deckId])
	const isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))

	function isMediaReadyForRecovery() {
		if (!deps.mediaElement) return false
		const readyState = deps.mediaElement.readyState
		return typeof readyState !== 'number' || readyState >= 2
	}

	let volumeRestoreTimer: ReturnType<typeof setTimeout> | undefined
	onDestroy(() => clearTimeout(volumeRestoreTimer))

	// Nudge a stalled media element back to life with a small real seek, then play.
	function nudge() {
		const el = deps.mediaElement
		if (!deck?.is_playing || !el || !isMediaReadyForRecovery()) return
		const t = el.currentTime
		if (typeof t === 'number' && Number.isFinite(t)) {
			el.currentTime = t > 0 ? Math.max(0, t - 0.05) : 0.01
		}
		play(deckId, el)
		// YouTube is documented (see broadcast.js) to reset some media element state
		// — playbackRate there — as a side effect of a reload/seek. Guard volume/mute
		// the same way, including once more after a delay to win any race with an
		// async reset on the provider's side.
		deps.restoreVolume()
		clearTimeout(volumeRestoreTimer)
		volumeRestoreTimer = setTimeout(() => {
			volumeRestoreTimer = undefined
			deps.restoreVolume()
		}, 1000)
	}

	// Foregrounding alone is not evidence of a stall, so only recover immediately
	// when paused, or after currentTime also fails to progress during a short
	// foreground observation.
	$effect(() => {
		if (isListeningToBroadcast || deck?.auto_radio) return
		let foregroundCheckTimer: ReturnType<typeof setTimeout> | undefined
		const resume = () => {
			clearTimeout(foregroundCheckTimer)
			if (
				document.visibilityState !== 'visible' ||
				!deck?.is_playing ||
				!deps.mediaElement ||
				!isMediaReadyForRecovery()
			) {
				return
			}
			if (deps.mediaElement.paused) {
				nudge()
				return
			}
			const t = deps.mediaElement.currentTime
			if (typeof t !== 'number' || !Number.isFinite(t)) return
			foregroundCheckTimer = setTimeout(() => {
				if (
					document.visibilityState === 'visible' &&
					deck?.is_playing &&
					deps.mediaElement &&
					isMediaReadyForRecovery() &&
					Math.abs(deps.mediaElement.currentTime - t) < 0.25
				) {
					log.warn('foreground_stall nudging', {deckId, t})
					nudge()
				}
			}, 1000)
		}
		document.addEventListener('visibilitychange', resume)
		window.addEventListener('pageshow', resume)
		return () => {
			clearTimeout(foregroundCheckTimer)
			document.removeEventListener('visibilitychange', resume)
			window.removeEventListener('pageshow', resume)
		}
	})

	// Second line of defense — self-heals while still backgrounded. Requires two
	// consecutive stalled samples and ignores providers that are still loading.
	$effect(() => {
		if (isListeningToBroadcast || deck?.auto_radio || !deck?.is_playing) return
		let lastTime = deps.mediaElement?.currentTime ?? 0
		let stalledTicks = 0
		const watchdog = setInterval(() => {
			const t = deps.mediaElement?.currentTime
			if (!isMediaReadyForRecovery()) {
				stalledTicks = 0
				if (typeof t === 'number' && Number.isFinite(t)) lastTime = t
				return
			}
			if (typeof t === 'number' && Number.isFinite(t)) {
				stalledTicks = Math.abs(t - lastTime) < 0.25 ? stalledTicks + 1 : 0
				if (stalledTicks >= 2) {
					log.warn('stall_watchdog nudging', {deckId, t})
					nudge()
					stalledTicks = 0
				}
				lastTime = t
			}
		}, 6000)
		return () => clearInterval(watchdog)
	})
}
