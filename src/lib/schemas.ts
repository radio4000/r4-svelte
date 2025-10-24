import {z} from 'zod'

export const channelSchema = z.object({
	id: z.string().uuid(),
	created_at: z.string(),
	updated_at: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().nullish(),
	image: z.string().nullish(),
	url: z.string().nullish(),
	tracks_outdated: z.boolean().nullish(),
	track_count: z.number().nullish(),
	latitude: z.number().nullish(),
	longitude: z.number().nullish(),
	firebase_id: z.string().nullish(),
	source: z.string().nullish(),
	broadcasting: z.boolean().nullish(),
	broadcast_track_id: z.string().nullish(),
	broadcast_started_at: z.string().nullish(),
	tracks_synced_at: z.string().nullish(),
	spam: z.boolean().nullish()
})

export const trackSchema = z.object({
	id: z.string().uuid(),
	created_at: z.string(),
	updated_at: z.string(),
	url: z.string(),
	title: z.string(),
	description: z.string().nullish(),
	discogs_url: z.string().nullish(),
	tags: z.array(z.string()).nullish(),
	mentions: z.array(z.string()).nullish(),
	firebase_id: z.string().nullish(),
	channel_id: z.string().nullish(),
	channel_slug: z.string().nullish(),
	ytid: z.string().nullish(),
	duration: z.number().nullish(),
	youtube_data: z.object({}).passthrough().nullish(),
	musicbrainz_data: z.object({}).passthrough().nullish(),
	discogs_data: z.object({}).passthrough().nullish()
})

export const appStateSchema = z.object({
	id: z.number(),
	playlist_tracks: z.array(z.string()),
	playlist_tracks_shuffled: z.array(z.string()),
	playlist_track: z.string().optional(),
	is_playing: z.boolean(),
	theme: z.string().optional(),
	volume: z.number(),
	custom_css_variables: z.record(z.string(), z.string()),
	counter: z.number(),
	channels_display: z.string(),
	channels_filter: z.string(),
	channels_shuffled: z.boolean(),
	channels: z.array(z.string()).optional(),
	shuffle: z.boolean(),
	broadcasting_channel_id: z.string().optional(),
	listening_to_channel_id: z.string().optional(),
	queue_panel_visible: z.boolean(),
	show_video_player: z.boolean(),
	player_expanded: z.boolean().optional(),
	shortcuts: z.record(z.string(), z.string()),
	hide_track_artwork: z.boolean(),
	user: z
		.object({
			id: z.string(),
			email: z.string()
		})
		.optional()
})

export const playHistorySchema = z.object({
	id: z.string().uuid(),
	track_id: z.string().uuid(),
	started_at: z.string(),
	ended_at: z.string().nullish(),
	ms_played: z.number().nullish(),
	reason_start: z.string().nullish(),
	reason_end: z.string().nullish(),
	shuffle: z.boolean().nullish(),
	skipped: z.boolean().nullish()
})

export const followerSchema = z.object({
	follower_id: z.string(),
	channel_id: z.string().uuid(),
	created_at: z.string(),
	synced_at: z.string().nullish()
})

export const trackMetaSchema = z.object({
	ytid: z.string(),
	duration: z.number().nullish(),
	youtube_data: z.object({}).passthrough().nullish(),
	youtube_updated_at: z.string().nullish(),
	musicbrainz_data: z.object({}).passthrough().nullish(),
	musicbrainz_updated_at: z.string().nullish(),
	discogs_data: z.object({}).passthrough().nullish(),
	discogs_updated_at: z.string().nullish(),
	updated_at: z.string().nullish()
})

export type Channel = z.infer<typeof channelSchema>
export type Track = z.infer<typeof trackSchema>
export type AppState = z.infer<typeof appStateSchema>
export type PlayHistory = z.infer<typeof playHistorySchema>
export type Follower = z.infer<typeof followerSchema>
export type TrackMeta = z.infer<typeof trackMetaSchema>
