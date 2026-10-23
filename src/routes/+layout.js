import {browser} from '$app/env'
import {appMode, seedUrls, EMBED_HOSTS} from '#lib/config.js'
import {validateListeningState} from '#lib/broadcast.js'
import {logger} from '#lib/logger.js'
import {sdk} from '@radio4000/sdk'
import {queryClient} from '#lib/collections/query-client.js'
import {
	tracksCollection,
	ensureTracksLoaded,
	addTrack,
	updateTrack,
	deleteTrack
} from '#lib/collections/tracks.js'
import {trackMetaCollection} from '#lib/collections/track-meta.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {spamDecisionsCollection} from '#lib/collections/spam-decisions.js'
import {broadcastsCollection} from '#lib/collections/broadcasts.js'
import {followsCollection} from '#lib/collections/follows.js'
import {captureEventsCollection} from '#lib/collections/capture-events.js'
import {cacheReady} from '#lib/query-cache-persistence.js'
import {collectionsHydrated} from '#lib/collection-persistence.js'
import {appState} from '#lib/app-state.svelte.js'
import * as api from '#lib/api.js'
import * as queue from '#lib/player/queue.js'
import {perfReport, perfReset} from '#lib/perf.js'

// Disable SSR — most pages are client-heavy. Individual pages/layouts
// that need SSR (e.g. [slug] channel pages) override this to true.
export const ssr = false

const log = logger.ns('layout').seal()

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	// IDB persistence is currently disabled — both resolve immediately.
	// Order matters when re-enabled: collections before cache restore (on-demand sync bug).
	if (browser) {
		await collectionsHydrated
		await cacheReady
	}

	const embedMode = !!(
		appMode === 'embed' ||
		(browser && EMBED_HOSTS.includes(window.location.hostname))
	)

	// Without seeds, preload takes milliseconds: finish it here so `{#await data.preloading}`
	// hydrates straight into the server-rendered page. A pending promise would hydrate the
	// loader branch instead, and Svelte would discard the server HTML and render it all again.
	// Seed imports can be slow, so standalone keeps the promise and shows the loader.
	const preloading = seedUrls ? preload() : await preload()
	return {
		embedMode,
		preloading,
		// Not part of preloading: a big last-played channel shouldn't hold up the first render
		deckTracksRestored: Promise.resolve(preloading).then(restoreDeckTracks),
		preload
	}
}

/** Restore tracks for saved deck queues so players can display on refresh. */
async function restoreDeckTracks() {
	if (!browser) return
	const deckSlugs = new Set(
		Object.values(appState.decks)
			.map((d) => d.playlist_slug)
			.filter(Boolean)
	)
	if (deckSlugs.size) {
		log.debug('ensuring_tracks_for_decks', {slugs: [...deckSlugs]})
	}
	await Promise.all(
		Array.from(/** @type {Set<string>} */ (deckSlugs), (slug) =>
			ensureTracksLoaded(slug).catch((err) => log.warn('deck_tracks_restore_failed', {slug, err}))
		)
	)
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
			const {loadSeeds} = await import('#lib/import.js')
			await loadSeeds(seedUrls).catch((err) => log.warn('seed_load_failed', err))
		}

		validateListeningState().catch((err) => log.error('validate_listening_state_error', err))

		// For debugging and console experimentation
		// @ts-expect-error debugging
		window.r5 = {
			sdk,
			appState,
			queryClient,
			tracksCollection,
			// The track forms' calls, for the bench's owner steps
			tracks: {addTrack, updateTrack, deleteTrack},
			trackMetaCollection,
			channelsCollection,
			broadcastsCollection,
			followsCollection,
			spamDecisionsCollection,
			captureEventsCollection,
			queue,
			api,
			perf: perfReport,
			perfReset,
			// Deterministic deck probe for testing: which deck is active and what each holds.
			// Prefer this over reading `is_playing` audio in headless — see browser-testing.md.
			decks: () =>
				Object.values(appState.decks).map((d) => ({
					id: d.id,
					slug: d.playlist_slug,
					playing: d.is_playing,
					active: d.id === appState.active_deck_id,
					auto: d.auto_radio
				}))
		}
	} catch (err) {
		log.error('preloading_error', err)
	} finally {
		// preloading = false
		log.debug('preloading_done')
	}
}
