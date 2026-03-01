export const appName = import.meta.env.PUBLIC_APP_NAME ?? 'Radio4000'
export const appShortName = import.meta.env.PUBLIC_APP_SHORT_NAME ?? 'R4'
export const appUrl =
	import.meta.env.PUBLIC_APP_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://beta.radio4000.com')
export const appDescription =
	import.meta.env.PUBLIC_APP_DESCRIPTION ?? 'Collect, curate, play and share your own radio channel'
export const appPlayerUrl = import.meta.env.PUBLIC_APP_PLAYER_URL ?? 'https://player.radio4000.com'
export const appCloudinaryUrl = import.meta.env.PUBLIC_APP_CLOUDINARY_URL ?? 'https://res.cloudinary.com/radio4000'
export const appLegalUrl = import.meta.env.PUBLIC_APP_LEGAL_URL ?? 'https://legal.radio4000.com'
export const appChatUrl = import.meta.env.PUBLIC_APP_CHAT_URL ?? 'https://matrix.to/#/#radio4000:matrix.org'
