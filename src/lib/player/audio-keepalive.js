/**
 * Audio keep-alive — keeps the page audible across track changes on a locked
 * Android screen. Between two YouTube tracks nothing plays for a moment (the old
 * video ended, the new one is loading). The browser then drops the page's
 * "playing media" state and its media notification, and Android freezes the
 * locked browser: the next track plays its first buffered second or two, then
 * stops (or goes quiet) until unlock.
 *
 * A near-silent looping <audio> in our own frame holds that state while the deck
 * plays. It's started once and stopped only on a real pause, never re-played per
 * track: the earlier "media session anchor" (removed in 9406a8e5) followed
 * deck.is_playing while YouTube's mid-switch pause still flipped it, so it went
 * quiet at every switch, the moment it was meant for.
 *
 * Browsers only count media that is long enough and audible: Firefox ignores
 * media under 3s (media.mediacontrol.eligible.media.duration.s) and stops media
 * control when a media ends (…stopcontrol.aftermediaends), Chrome treats media
 * under 5s as transient. So: a 10s loop, never digital zero. Firefox counts a
 * stream as audible when a sample exceeds -72 dBFS (AudibilityMonitor), Chrome
 * when its power does. The signal is a constant DC offset at -66 dBFS: it passes
 * both checks but has no frequency content, so no speaker or sound system can
 * reproduce it (amplifiers block DC). Noise (-60 dBFS) was heard as hiss, and
 * any tone, even infrasonic, can reach a big subwoofer. Constant, so the loop
 * point is seamless. Android only: iOS Safari can pause other media when a page
 * starts a second audio element.
 */

import {logger} from '#lib/logger.js'

const log = logger.ns('audio-keepalive').seal()

const enabled = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/** @type {HTMLAudioElement | null} */
let audio = null

/** Deck IDs currently holding the keep-alive open. */
const activeDeckIds = new Set()

/** Ten seconds of a -66 dBFS DC offset, 8kHz mono 16-bit, as a WAV object URL. */
function offsetUrl() {
	const rate = 8000
	const samples = rate * 10
	const view = new DataView(new ArrayBuffer(44 + samples * 2))
	const text = (/** @type {number} */ at, /** @type {string} */ s) => {
		for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
	}
	text(0, 'RIFF')
	view.setUint32(4, 36 + samples * 2, true)
	text(8, 'WAVE')
	text(12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, rate, true)
	view.setUint32(28, rate * 2, true)
	view.setUint16(32, 2, true)
	view.setUint16(34, 16, true)
	text(36, 'data')
	view.setUint32(40, samples * 2, true)
	for (let i = 0; i < samples; i++) {
		view.setInt16(44 + i * 2, 16, true)
	}
	return URL.createObjectURL(new Blob([view], {type: 'audio/wav'}))
}

/** Keep the page audible while `deckId` plays. Ref-counted across decks, like wake-lock.js.
 *  @param {number} deckId */
export function requestAudioKeepAlive(deckId) {
	if (!enabled) return
	activeDeckIds.add(deckId)
	if (!audio) {
		audio = new Audio(offsetUrl())
		audio.loop = true
	}
	if (audio.paused) {
		audio.play().catch((error) => log.debug('play_failed', /** @type {Error} */ (error).message))
	}
}

/** @param {number} deckId */
export function releaseAudioKeepAlive(deckId) {
	activeDeckIds.delete(deckId)
	if (!activeDeckIds.size && audio) audio.pause()
}
