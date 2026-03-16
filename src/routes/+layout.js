import {browser} from '$app/environment'
import {appMode, seedUrls, EMBED_HOSTS} from '$lib/config'
import {validateListeningState} from '$lib/broadcast.js'
import {logger} from '$lib/logger'
import {sdk} from '@radio4000/sdk'
import {queryClient} from '$lib/collections/query-client'
import {tracksCollection, ensureTracksLoaded} from '$lib/collections/tracks'
import {trackMetaCollection} from '$lib/collections/track-meta'
import {channelsCollection} from '$lib/collections/channels'
import {spamDecisionsCollection} from '$lib/collections/spam-decisions'
import {broadcastsCollection} from '$lib/collections/broadcasts'
import {followsCollection} from '$lib/collections/follows'
import {playHistoryCollection} from '$lib/collections/play-history'
import {cacheReady} from '$lib/query-cache-persistence'
import {collectionsHydrated} from '$lib/collection-persistence'
import {appState} from '$lib/app-state.svelte'
import * as api from '$lib/api'
import * as queue from '$lib/player/queue'

import '$lib/rough-spinner.js'

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

	const embedMode = !!(appMode === 'embed' || (browser && EMBED_HOSTS.includes(window.location.hostname)))

	return {
		embedMode,
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

		if (seedUrls) {
			const {loadSeeds} = await import('$lib/import.js')
			await loadSeeds(seedUrls).catch((err) => log.warn('seed_load_failed', err))
		}

		validateListeningState().catch((err) => log.error('validate_listening_state_error', err))

		// Restore tracks for saved deck queues so players can display on refresh
		const deckSlugs = new Set(
			Object.values(appState.decks)
				.map((d) => d.playlist_slug)
				.filter(Boolean)
		)
		if (deckSlugs.size) {
			log.debug('ensuring_tracks_for_decks', {slugs: [...deckSlugs]})
		}
		await Promise.all(
			[.../** @type {Set<string>} */ (deckSlugs)].map((slug) =>
				ensureTracksLoaded(slug).catch((err) => log.warn('deck_tracks_restore_failed', {slug, err}))
			)
		)

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
			playHistoryCollection,
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
