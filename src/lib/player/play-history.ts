import {capture} from '#lib/analytics.js'
import {uuid} from '#lib/utils.js'
import type {Deck, PlayEndReason, PlayStartReason, Track} from '#lib/types.js'

/** Capture track_end for the track being left and track_play for the one starting, and
 *  reset the deck's listen counters. Runs in playTrack before deck.playlist_track changes. */
export function capturePlayHistory(
	deck: Deck,
	track: Track,
	id: string,
	endReason: PlayEndReason | null,
	startReason: PlayStartReason,
	isEphemeral: boolean
) {
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
}
