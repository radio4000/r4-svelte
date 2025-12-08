import {browser} from '$app/environment'
import {validateListeningState} from '$lib/broadcast.js'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {queryClient, tracksCollection, channelsCollection, spamDecisionsCollection} from './tanstack/collections'
import {cacheReady} from './tanstack/persistence'
import {fetchAllChannels} from '$lib/api/fetch-channels'
import {appState} from '$lib/app-state.svelte'

// Disable SSR
export const ssr = false

const log = logger.ns('layout').seal()

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	// Wait for cache restore before component mounts - prevents state_unsafe_mutation
	// when useLiveQuery subscriptions fire during hydration
	if (browser) await cacheReady

	return {
		preloading: preload(),
		preload
	}
}

async function preload() {
	if (!browser) {
		log.warn('preloading_failed_no_browser')
		return
	}
	log.debug('preloading')
	try {
		await cacheReady

		// Prefetch all channels so search works immediately
		await queryClient.prefetchQuery({
			queryKey: ['channels'],
			queryFn: fetchAllChannels,
			staleTime: 24 * 60 * 60 * 1000 // 24h - match channelsCollection
		})

		validateListeningState().catch((err) => log.error('validate_listening_state_error', err))

		// For debugging
		// @ts-expect-error debugging
		window.r5 = {sdk, appState, queryClient, tracksCollection, channelsCollection, spamDecisionsCollection}
	} catch (err) {
		log.error('preloading_error', err)
	} finally {
		// preloading = false
		log.debug('preloading_done')
	}
}
