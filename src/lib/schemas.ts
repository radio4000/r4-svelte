import {z} from 'zod'

export const channelSchema = z.object({
	id: z.string().uuid(),
	created_at: z.string(),
	updated_at: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().optional(),
	image: z.string().optional(),
	url: z.string().optional(),
	tracks_outdated: z.boolean().optional(),
	track_count: z.number().optional(),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	firebase_id: z.string().optional(),
	source: z.string().optional(),
	broadcasting: z.boolean().optional(),
	broadcast_track_id: z.string().optional(),
	broadcast_started_at: z.string().optional(),
	tracks_synced_at: z.string().optional(),
	spam: z.boolean().optional()
})

export const trackSchema = z.object({
	id: z.string().uuid(),
	created_at: z.string(),
	updated_at: z.string(),
	url: z.string(),
	title: z.string(),
	description: z.string().optional(),
	discogs_url: z.string().optional(),
	tags: z.array(z.string()).optional(),
	mentions: z.array(z.string()).optional(),
	firebase_id: z.string().optional(),
	channel_id: z.string().optional(),
	channel_slug: z.string().optional(),
	ytid: z.string().optional(),
	duration: z.number().optional(),
	youtube_data: z.object({}).passthrough().optional(),
	musicbrainz_data: z.object({}).passthrough().optional(),
	discogs_data: z.object({}).passthrough().optional()
})

export const appStateSchema = z.object({
	id: z.number(),
	playlist_tracks: z.array(z.string()),
	playlist_tracks_shuffled: z.array(z.string()),
	playlist_track: z.string().optional(),
	is_playing: z.boolean(),
	theme: z.string().optional(),
	volume: z.number(),
	custom_css_variables: z.record(z.string()),
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
	shortcuts: z.record(z.string()),
	hide_track_artwork: z.boolean(),
	user: z
		.object({
			id: z.string(),
			email: z.string()
		})
		.optional()
})

export type Channel = z.infer<typeof channelSchema>
export type Track = z.infer<typeof trackSchema>
export type AppState = z.infer<typeof appStateSchema>
