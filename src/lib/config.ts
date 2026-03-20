import {env} from '$env/dynamic/public'

// All public configuration is read from $env/dynamic/public so values set
// via CI environment variables (GitHub Actions vars, Cloudflare env, etc.)
// are picked up correctly at runtime. Sane defaults are provided for every
// optional value so the app works out of the box without any .env file.

export const EMBED_HOSTS = ['player.radio4000.com', 'r5.i4k.workers.dev']

/** "standalone" | "embed" | undefined — set by build scripts, not end users */
export const appMode = env.PUBLIC_APP_MODE

/** Comma-separated seed URLs to auto-import on startup (standalone mode) */
export const seedUrls = env.PUBLIC_SEED_URLS

export const appName = env.PUBLIC_APP_NAME ?? 'Radio4000'
export const appShortName = env.PUBLIC_APP_SHORT_NAME ?? 'R4'
export const appUrl =
	env.PUBLIC_APP_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://beta.radio4000.com')
export const appDescription = env.PUBLIC_APP_DESCRIPTION ?? 'Collect, curate, play and share your own radio channel'
export const appPlayerUrl = env.PUBLIC_APP_PLAYER_URL ?? 'https://player.radio4000.com'
export const appCloudinaryUrl = env.PUBLIC_APP_CLOUDINARY_URL ?? 'https://res.cloudinary.com/radio4000'
export const appLegalUrl = env.PUBLIC_APP_LEGAL_URL ?? 'https://legal.radio4000.com'
export const appChatUrl = env.PUBLIC_APP_CHAT_URL ?? 'https://matrix.to/#/#radio4000:matrix.org'
export const appDiscordUrl = env.PUBLIC_APP_DISCORD_URL ?? 'https://discord.gg/ewYxG8cwZ5'
export const appSocialUrl = env.PUBLIC_APP_SOCIAL_URL ?? 'https://bsky.app/profile/radio4000.com'

export type CommunityLink = {
	label: string
	href: string
	description?: string
}

/** Community / social links shown on /menu/community. Add, remove or reorder here. */
export const communityLinks: CommunityLink[] = [
	{label: 'Bluesky', href: appSocialUrl, description: '@radio4000'},
	{label: 'Discord', href: appDiscordUrl},
	{label: 'Matrix', href: appChatUrl},
	{label: 'Blog', href: 'https://blog.radio4000.com'}
]
/** Canonical icon name per UI concept — import instead of hardcoding icon strings */
export const conceptIcons = {
	home: 'radio',
	channels: 'database',
	tracks: 'play-fill',
	tags: 'tag',
	search: 'search',
	feed: 'history',
	history: 'history',
	broadcast: 'cell-signal',
	settings: 'options-vertical-encircled',
	info: 'circle-info',
	mentions: 'user',
	following: 'sparkles',
	followers: 'users',
	map: 'map',
	backup: 'document-download',
	batchEdit: 'unordered-list',
	delete: 'delete',
} as const

export const posthogKey = env.PUBLIC_POSTHOG_KEY ?? 'phc_hjAzrJR1oqwdWF2chYKVdAkAQAXtTgd576iTuMTfuEO'
export const posthogHost = env.PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'
export const youtubeApiKey = env.PUBLIC_YOUTUBE_KEY ?? 'AIzaSyDCLAKtHqvRA8ucWLnFtLEPq6qC2fWomQk'
