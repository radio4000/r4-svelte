import {appMode} from '$lib/config'

export type AppMode = 'default' | 'standalone' | 'embed'
const mode = (appMode as AppMode) ?? 'default'

/** Named capability flags — import instead of doing `appMode === 'standalone'` checks */
export const capabilities = {
	auth: mode !== 'standalone', // sign in/up/reset
	mutations: mode !== 'standalone', // create/edit/delete channels & tracks
	follows: mode !== 'standalone', // follow/unfollow
	broadcasts: mode !== 'standalone', // /broadcasts page + broadcast controls
	chat: mode !== 'standalone', // /chat
	globalBrowse: mode !== 'standalone', // Supabase queries for global channels/tracks
	navigation: mode !== 'embed', // show header/nav
	navigateOut: mode !== 'embed' // allow links/keyboard shortcuts out of /embed
} as const

/** Route path prefixes to redirect away from in standalone mode */
export const DISABLED_ROUTES: string[] =
	mode === 'standalone' ? ['/auth', '/recovery', '/create-channel', '/broadcasts', '/chat'] : []

export const DISABLED_ROUTE_FALLBACK = '/'
