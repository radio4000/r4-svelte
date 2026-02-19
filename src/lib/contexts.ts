import {createContext} from 'svelte'
import type {Track} from '$lib/types'

/* I never liked context, but sometimes it's useful to avoid re-computing shared values that aren't stored on appState. */

/** Tracks query from [slug] layout */
export const [getTracksQueryCtx, setTracksQueryCtx] = createContext<{
	data: Track[]
	isReady: boolean
	isLoading: boolean
}>()
