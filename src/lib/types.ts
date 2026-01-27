import type {Channel as SDKChannel, Track as SDKTrack} from '@radio4000/sdk'

// Extends SDK Channel with r5-specific fields
export interface Channel extends SDKChannel {
	broadcasting?: boolean
	broadcast_track_id?: string | null
	broadcast_started_at?: string | null
	spam?: boolean
}

// SDK Track now has id: string, just re-export with alias
export type Track = SDKTrack

// Track joined with metadata from TrackMeta collection
export interface TrackWithMeta extends Track {
	ytid?: string
	youtube_data?: {id?: string; duration?: number; [key: string]: unknown}
	musicbrainz_data?: object
	discogs_data?: object
}

export interface AppState {
	id: number
	playlist_tracks: string[]
	playlist_tracks_shuffled: string[]
	playlist_track?: string
	is_playing: boolean
	theme?: string
	volume: number
	custom_css_variables: Record<string, string>
	counter: number
	channels_display: string
	channels_filter: string
	channels_order: 'updated' | 'created' | 'name' | 'tracks'
	channels_order_direction: 'asc' | 'desc'
	channels_shuffled: boolean
	/** the user's channels (IDs) */
	channels?: string[]
	/** the user's primary channel (full object) */
	channel?: Channel
	shuffle: boolean
	broadcasting_channel_id?: string
	listening_to_channel_id?: string
	queue_panel_visible: boolean
	queue_panel_width?: number
	show_video_player: boolean
	player_expanded?: boolean
	shortcuts?: Record<string, string>
	hide_track_artwork: boolean
	user?: User
	language?: string
	modal_track_add?: {track?: Track; url?: string} | null
	modal_track_edit?: {track: Track} | null
	modal_share?: {track?: Track; channel: Channel} | null
}

export interface UserIdentity {
	id: string
	provider: string
	identity_data?: {email?: string; [key: string]: unknown}
}

interface User {
	id: string
	email: string
	identities?: UserIdentity[]
}

export type KeyBindingsConfig = Record<string, string>

export interface Broadcast {
	channel_id: string
	track_id: string
	track_played_at: string
}

export interface BroadcastWithChannel extends Broadcast {
	channels: Channel
	tracks: Track | null
}

export interface PlayHistory {
	id: string
	track_id: string
	slug: string
	title: string
	url: string
	started_at: string
	ended_at?: string
	ms_played: number
	reason_start?: string
	reason_end?: string
	shuffle: boolean
	skipped: boolean
}

/**
 * Why a track started playing
 * - auto_next: Automatic advance after track completed
 * - broadcast_sync: Synced from broadcast
 * - play_channel: Started playing a channel (first track)
 * - play_search: Started from search results
 * - track_error: Previous track had error, auto-advancing
 * - user_click_track: User clicked on a specific track
 * - user_next: User clicked next button
 * - user_prev: User clicked previous button
 */
export type PlayStartReason =
	| 'auto_next'
	| 'broadcast_sync'
	| 'play_channel'
	| 'play_search'
	| 'track_error'
	| 'user_click_track'
	| 'user_next'
	| 'user_prev'

/**
 * Why a track stopped playing
 * - broadcast_sync: Stopped due to broadcast sync
 * - playlist_change: Playlist/queue changed while playing
 * - track_completed: Track played to the end naturally
 * - user_next: User clicked next button
 * - user_prev: User clicked previous button
 * - user_stop: User clicked stop/pause
 * - youtube_error: YouTube player error (stored as youtube_error_${code} with specific error codes)
 */
export type PlayEndReason =
	| 'broadcast_sync'
	| 'playlist_change'
	| 'track_completed'
	| 'user_next'
	| 'user_prev'
	| 'user_stop'
	| 'youtube_error'

export interface Ok<T> {
	ok: true
	value: T
}

export interface Err<E> {
	ok: false
	error: E
}

export function ok<T>(value: T): Ok<T> {
	return {
		ok: true,
		value
	}
}

export function err<T>(error: T): Err<T> {
	return {
		ok: false,
		error
	}
}
