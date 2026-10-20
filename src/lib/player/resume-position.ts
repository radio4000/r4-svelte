/**
 * Resume position — saves each deck's playhead when the page hides, so a
 * reload picks the track up where it was on first play. Own localStorage key,
 * written synchronously: the appState effect flushes too late on pagehide.
 * Skips auto-radio and broadcast decks; they sync to live time instead.
 */
import {appState} from '#lib/app-state.svelte.js'
import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'

const RESUME_KEY = LOCAL_STORAGE_KEYS.resumePositions

type ResumePosition = {track_id: string; seconds: number}
let resumePositions: Record<number, ResumePosition> | undefined

function loadResumePositions(): Record<number, ResumePosition> {
	if (!resumePositions) {
		try {
			resumePositions = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') ?? {}
		} catch {
			resumePositions = {}
		}
	}
	return resumePositions as Record<number, ResumePosition>
}

/** The deck's saved playhead from the last session, returned once. */
export function takeResumePosition(deckId: number): ResumePosition | undefined {
	const positions = loadResumePositions()
	const position = positions[deckId]
	delete positions[deckId]
	return position
}

if (typeof window !== 'undefined') {
	const saveResumePositions = () => {
		const positions: Record<number, ResumePosition> = {}
		const unclaimed = loadResumePositions()
		for (const deck of Object.values(appState.decks)) {
			if (deck.auto_radio || deck.listening_to_channel_id || !deck.playlist_track) continue
			const seconds = Math.floor(deck.media_current_time ?? 0)
			// Not played since reload: keep the spot it hasn't resumed to yet.
			const pending = unclaimed[deck.id]
			if (!seconds && pending?.track_id === deck.playlist_track) positions[deck.id] = pending
			else if (seconds) positions[deck.id] = {track_id: deck.playlist_track, seconds}
		}
		localStorage.setItem(RESUME_KEY, JSON.stringify(positions))
	}
	window.addEventListener('pagehide', saveResumePositions)
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') saveResumePositions()
	})
}
