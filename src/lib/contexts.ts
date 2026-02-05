import {createContext} from 'svelte'
import type {Channel, Track} from '$lib/types'

/* I never liked context, but sometimes it's useful to avoid re-computing shared values that aren't stored on appState. */

/** Channels list from root layout */
export const [getChannelsCtx, setChannelsCtx] = createContext<() => Channel[]>()

/** Tracks query from [slug] layout */
export const [getTracksQueryCtx, setTracksQueryCtx] = createContext<{
	data: Track[]
	isReady: boolean
	isLoading: boolean
}>()

/** Can-edit getter from [slug] layout */
export const [getCanEditCtx, setCanEditCtx] = createContext<() => boolean>()
