import type {Channel as SDKChannel, Track as SDKTrack, Database} from '@radio4000/sdk'

// Extends Channel with specific fields we use in this app (not persisted)
export interface Channel extends SDKChannel {
	spam?: boolean
}

export type Track = SDKTrack

export interface TrackMetadataFields {
	youtube_data?: {id?: string; duration?: number; [key: string]: unknown}
	musicbrainz_data?: object
	discogs_data?: object
}

// Track joined with metadata from TrackMeta collection
export interface TrackWithMeta extends Track, TrackMetadataFields {}

export interface Deck {
	id: number
	playlist_title?: string
	playlist_slug?: string
	playlist_track?: string
	playlist_tracks: string[]
	playlist_tracks_shuffled: string[]
	is_playing: boolean
	shuffle: boolean
	volume: number
	muted?: boolean
	hide_video_player: boolean
	compact: boolean
	expanded: boolean
	hide_queue_panel: boolean
	queue_panel_width?: number
	broadcasting_channel_id?: string
	listening_to_channel_id?: string
	auto_radio?: boolean
	auto_radio_drifted?: boolean
	view?: import('$lib/views').View
	auto_radio_rotation_start?: number
	listening_drifted?: boolean
	play_id?: string
	track_played_at?: string
	seeked_at?: string
	seek_position?: number
	speed?: number
	media_current_time?: number
	media_duration?: number
}

export interface AppState {
	id: number
	decks: Record<number, Deck>
	next_deck_id: number
	active_deck_id: number
	theme?: string
	custom_css_variables: Record<string, string>
	channels_display: 'grid' | 'list' | 'map' | 'infinite' | 'tuner'
	channels_filter: string
	channels_order: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	channels_order_direction: 'asc' | 'desc'
	followers_display?: 'grid' | 'list' | 'map' | 'infinite'
	followers_order?: 'updated' | 'created' | 'name' | 'tracks'
	followers_direction?: 'asc' | 'desc'
	following_display?: 'grid' | 'list' | 'map' | 'infinite'
	following_order?: 'updated' | 'created' | 'name' | 'tracks'
	following_direction?: 'asc' | 'desc'
	/** the user's channels (IDs) */
	channels?: string[]
	/** the user's primary channel (full object) */
	channel?: Channel
	shortcuts?: Record<string, string>
	hide_track_artwork: boolean
	/** Default volume for new decks: 0 (silent) or 1 (full) */
	default_new_deck_volume: 0 | 1
	/** Whether new decks auto-play when a track is loaded */
	autoplay_new_deck: boolean
	/** Show playback speed control in deck transport */
	show_speed_control?: boolean
	/** Show track progress/range control in deck transport */
	show_track_range_control?: boolean
	/** Use pointer cursor on interactive elements instead of default arrow */
	use_pointer_cursor?: boolean
	font_family?: string
	user?: User
	language?: string
	modal_track_add?: {track?: Track; url?: string} | null
	modal_track_edit?: {track: Track} | null
	modal_share?: {track?: Track; channel: Channel} | null
	modal_shortcuts?: boolean
	show_welcome_hint?: boolean
	show_onboarding_hint?: boolean
	analytics_opt_in?: boolean
	/** Hides navigation and external links; set by the server on embed domains. */
	embed_mode?: boolean
	/** IDs of locally imported channels (not from remote DB) */
	local_channel_ids?: string[]
	/** Full channel objects for locally imported channels — durable store used by queryFn */
	local_channels?: Channel[]
	/** Origin metadata for each locally imported channel, keyed by channel ID */
	local_channel_origins?: Record<string, ImportOrigin>
}

/** Where a locally imported channel came from. */
export interface ImportOrigin {
	/** How the channel was imported */
	type: 'url' | 'file' | 'folder' | 'audio-folder'
	/** Source URL, set for URL-based imports */
	url?: string
	/** ISO date string of when the import happened */
	importedAt: string
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
	user_metadata?: {share_presence?: boolean; [key: string]: unknown}
}

export type KeyBindingsConfig = Record<string, string>

export interface BroadcastDeckState extends Partial<import('@radio4000/sdk').BroadcastDeckState> {
	track_url?: string | null
	track_title?: string | null
	track_media_id?: string | null
}

export type Broadcast = Database['public']['Tables']['broadcast']['Row'] & {
	decks?: BroadcastDeckState[] | null
}

export interface CaptureEvent {
	id: string
	event: string
	properties?: Record<string, unknown>
	created_at: string
}

export interface BroadcastWithChannel extends Broadcast {
	channels: Channel
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
