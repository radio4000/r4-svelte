#!/usr/bin/env node
/**
 * Checks PR-scope i18n keys where non-English values still match English fallback.
 * Usage: node i18n/check.js
 */
import {readdirSync, readFileSync} from 'fs'
import {join, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const messagesDir = join(__dirname, 'messages')

const enPath = join(messagesDir, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf8'))

const files = readdirSync(messagesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')

const requiredKeys = [
	'broadcast_listener_warning',
	'channel_card_join_broadcast',
	'channel_card_share',
	'channel_card_visit',
	'channel_first_track_cta',
	'channel_no_tracks',
	'channel_pause_tag',
	'channel_play_latest',
	'channel_play_tag',
	'channel_queue_tag',
	'channel_section_latest',
	'channel_section_radios',
	'channel_tracks_search_placeholder',
	'channels_filter_tooltip_broadcasting',
	'common_follow',
	'common_pause',
	'common_queue',
	'common_unfollow',
	'discogs_avg_rating',
	'discogs_country',
	'discogs_format',
	'discogs_have_count',
	'discogs_in_channel',
	'discogs_label_field',
	'discogs_no_video',
	'discogs_play_next',
	'discogs_play_release',
	'discogs_ratings_count',
	'discogs_release_date',
	'discogs_release_summary',
	'discogs_suggested_tags',
	'discogs_use_button',
	'discogs_want_count',
	'discogs_users_have',
	'discogs_users_want',
	'discogs_video_available',
	'discogs_view_on_discogs',
	'header_go_to_channel',
	'header_start_your_radio',
	'player_broadcast_live',
	'player_broadcast_paused',
	'player_broadcast_playing',
	'player_broadcast_synced',
	'player_compact_next',
	'player_compact_play_pause',
	'player_compact_prev',
	'player_compact_show_panel',
	'player_sync_broadcast',
	'player_tooltip_close_deck',
	'player_tooltip_compact',
	'queue_clear_search',
	'settings_changelog',
	'settings_player',
	'status_broadcasting',
	'track_card_locate_in_list',
	'track_card_open_video',
	'track_card_play_in_deck',
	'track_form_description_placeholder',
	'track_form_discogs_placeholder',
	'track_form_title_placeholder',
	'track_meta_mentions',
	'tracks_no_results',
	'views_add_new',
	'views_channels_label',
	'views_channels_placeholder',
	'views_delete_aria',
	'views_delete_confirm',
	'views_display_label',
	'views_filters_label',
	'views_limit_label',
	'views_limit_placeholder',
	'views_name_placeholder',
	'views_save_as_label',
	'views_search_label',
	'views_search_placeholder',
	'views_sort_label',
	'views_tags_all',
	'views_tags_any',
	'views_tags_label',
	'views_tags_placeholder',
	'views_update_named',
	'views_view_name_placeholder'
]

let totalUntranslated = 0

for (const file of files) {
	const path = join(messagesDir, file)
	const lang = JSON.parse(readFileSync(path, 'utf8'))
	const untranslated = requiredKeys.filter((key) => !lang[key] || lang[key] === en[key])
	if (untranslated.length > 0) {
		console.log(`${file}: ${untranslated.length} untranslated`)
		totalUntranslated += untranslated.length
	}
}

if (totalUntranslated === 0) {
	console.log(`All ${requiredKeys.length} scoped keys translated in all languages`)
} else {
	console.log(`\nTotal: ${totalUntranslated} untranslated scoped keys across all languages`)
	process.exitCode = 1
}
