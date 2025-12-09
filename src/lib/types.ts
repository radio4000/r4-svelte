import type {Channel as SDKChannel, ChannelTrack as SDKChannelTrack} from '@radio4000/sdk'

// From r5-channels.json (v1 firebase export)
export interface ChannelFirebase {
	firebase_id: string
	created_at: number
	updated_at: number
	name: string
	slug: string
	description?: string
	image?: string
	track_count?: number
	track_ids?: string[]
}

// Extends SDK Channel, omitting internal DB fields
export interface Channel extends Omit<SDKChannel, 'coordinates' | 'fts' | 'latest_track_at' | 'track_count'> {
	id: string // override nullable from view
	name: string
	slug: string
	// from channels_with_tracks view (optional when from base table)
	latest_track_at?: string | null
	track_count?: number | null
	source?: 'v1' | 'v2'
	// broadcasting
	broadcasting?: boolean
	broadcast_track_id?: string | null
	broadcast_started_at?: string | null
	// local only
	spam?: boolean
}

// Extends SDK ChannelTrack (includes slug, duration, playback_error from view)
export interface Track extends SDKChannelTrack {
	id: string // override nullable from view
	created_at: string
	updated_at: string
	url: string
	title: string
	// local extensions
	firebase_id?: string
	channel_id?: string
	source?: 'v1' | 'v2'
}

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
	show_video_player: boolean
	player_expanded?: boolean
	shortcuts: Record<string, string>
	hide_track_artwork: boolean
	user?: User
	language?: string
}

interface User {
	id: string
	email: string
}

export type KeyBindingsConfig = Record<string, string>

export interface Broadcast {
	channel_id: string
	track_id: string
	track_played_at: string
}

export interface BroadcastWithChannel extends Broadcast {
	channels: Channel
}

export interface PlayHistory {
	id: string
	track_id: string
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
