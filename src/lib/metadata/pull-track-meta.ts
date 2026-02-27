import type {Channel, Track, TrackWithMeta} from '$lib/types'
import {logger} from '$lib/logger'
import {trackMetaCollection} from '$lib/collections/track-meta'
import {updateTrack} from '$lib/collections/tracks'
import {huntDiscogs, pullDiscogs} from '$lib/metadata/discogs'
import {pullMusicBrainz} from '$lib/metadata/musicbrainz'
import {pullYouTubeSingle} from '$lib/metadata/youtube'
import {deriveTrackMedia} from './track-media'

const log = logger.ns('metadata/pull-track-meta').seal()

type TrackInput = Track | TrackWithMeta | null | undefined

export type EnsureTrackMetaResult = {
	error?: string
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export async function ensureYouTubeMeta(track: TrackInput, channel?: Channel): Promise<EnsureTrackMetaResult> {
	if (!track) return {}

	const {provider, mediaId} = deriveTrackMedia(track)
	if (provider !== 'youtube' || !mediaId) return {}
	if (trackMetaCollection.get(mediaId)?.youtube_data) return {}

	try {
		await pullYouTubeSingle(mediaId)
		const duration = Number(trackMetaCollection.get(mediaId)?.youtube_data?.duration ?? 0)
		if (duration > 0 && !track.duration && channel) {
			await updateTrack(channel, track.id, {duration})
		}
		return {}
	} catch (error) {
		log.error('youtube failed', {mediaId, error})
		return {error: `YouTube metadata unavailable: ${getErrorMessage(error)}`}
	}
}

export async function ensureMusicbrainzMeta(track: TrackInput): Promise<EnsureTrackMetaResult> {
	if (!track) return {}

	const {mediaId} = deriveTrackMedia(track)
	if (!mediaId || !track.title) return {}
	if (trackMetaCollection.get(mediaId)?.musicbrainz_data) return {}

	try {
		await pullMusicBrainz(mediaId, track.title)
		return {}
	} catch (error) {
		log.error('musicbrainz failed', {mediaId, error})
		return {error: `MusicBrainz metadata unavailable: ${getErrorMessage(error)}`}
	}
}

export async function ensureDiscogsMeta(track: TrackInput): Promise<EnsureTrackMetaResult> {
	if (!track) return {}

	const {mediaId} = deriveTrackMedia(track)
	if (!mediaId) return {}
	if (trackMetaCollection.get(mediaId)?.discogs_data) return {}

	try {
		let discogsUrl = track.discogs_url || null
		if (!discogsUrl) {
			discogsUrl = await huntDiscogs(track.id, mediaId, track.title)
		}
		if (discogsUrl) {
			await pullDiscogs(mediaId, discogsUrl)
		}
		return {}
	} catch (error) {
		log.error('discogs failed', {mediaId, error})
		return {error: `Discogs metadata unavailable: ${getErrorMessage(error)}`}
	}
}
