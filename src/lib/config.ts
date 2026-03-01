export const appName = import.meta.env.PUBLIC_APP_NAME ?? 'Radio4000'
export const appShortName = import.meta.env.PUBLIC_APP_SHORT_NAME ?? 'R4'
export const appUrl =
	import.meta.env.PUBLIC_APP_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://beta.radio4000.com')
export const appDescription =
	import.meta.env.PUBLIC_APP_DESCRIPTION ?? 'Collect, curate, play and share your own radio channel'
