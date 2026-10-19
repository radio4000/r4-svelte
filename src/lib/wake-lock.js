import {logger} from '#lib/logger.js'

const log = logger.ns('wake-lock').seal()

/** @type {WakeLockSentinel | null} */
let sentinel = null

/** Deck IDs currently holding the wake lock open. */
const activeDeckIds = new Set()

let acquiring = false

async function acquire() {
	if (!('wakeLock' in navigator) || sentinel || acquiring) return
	acquiring = true
	try {
		const acquired = await navigator.wakeLock.request('screen')
		// All decks may have released while the request was in flight
		if (!activeDeckIds.size) {
			void acquired.release().catch(() => {})
			return
		}
		sentinel = acquired
		acquired.addEventListener('release', () => {
			if (sentinel === acquired) sentinel = null
		})
	} catch (error) {
		log.debug('request_failed', /** @type {Error} */ (error).message)
	} finally {
		acquiring = false
	}
}

async function release() {
	if (!sentinel) return
	try {
		await sentinel.release()
	} catch {
		// already released (e.g. tab was hidden)
	}
	sentinel = null
}

/** Hold the screen wake lock while `deckId` is playing. Ref-counted across decks —
 *  the lock is only released once every deck has called {@link releasePlaybackWakeLock}. */
export function requestPlaybackWakeLock(deckId) {
	activeDeckIds.add(deckId)
	void acquire()
}

/** Stop holding the wake lock on behalf of `deckId`. */
export function releasePlaybackWakeLock(deckId) {
	activeDeckIds.delete(deckId)
	if (!activeDeckIds.size) void release()
}

if (typeof document !== 'undefined') {
	// Wake locks auto-release when a tab is backgrounded — re-acquire on return if
	// playback is still expected to hold one.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && activeDeckIds.size) void acquire()
	})
}
