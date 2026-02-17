import {browser} from '$app/environment'
import {validateListeningState} from '$lib/broadcast.js'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {
	queryClient,
	tracksCollection,
	trackMetaCollection,
	channelsCollection,
	spamDecisionsCollection,
	broadcastsCollection,
	followsCollection,
	ensureTracksLoaded
} from '$lib/tanstack/collections'
import {cacheReady} from '$lib/tanstack/query-cache-persistence'
import {collectionsHydrated} from '$lib/tanstack/collection-persistence'
import {fetchAllChannels} from '$lib/api/fetch-channels'
import {appState} from '$lib/app-state.svelte'
import * as api from '$lib/api'
import * as queue from '$lib/player/queue'

// Disable SSR
export const ssr = false

const log = logger.ns('layout').seal()

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	// Hydrate collections from IDB BEFORE cache restore to avoid on-demand sync bug
	// See plan-data-flow-bug.md for details
	if (browser) {
		await collectionsHydrated
		await cacheReady
	}

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

		// Restore tracks for saved deck queues so players can display on refresh
		const deckSlugs = new Set(
			Object.values(appState.decks)
				.map((d) => d.playlist_slug)
				.filter(Boolean)
		)
		for (const slug of /** @type {Set<string>} */ (deckSlugs)) {
			ensureTracksLoaded(slug).catch((err) => log.warn('deck_tracks_restore_failed', {slug, err}))
		}

		// For debugging and console experimentation
		// @ts-expect-error debugging
		window.r5 = {
			sdk,
			appState,
			queryClient,
			tracksCollection,
			trackMetaCollection,
			channelsCollection,
			broadcastsCollection,
			followsCollection,
			spamDecisionsCollection,
			queue,
			api
		}
	} catch (err) {
		log.error('preloading_error', err)
	} finally {
		// preloading = false
		log.debug('preloading_done')
	}
}
