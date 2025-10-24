import {browser} from '$app/environment'
import {initAppState, validateListeningState} from '$lib/app-state.svelte'
import {logger} from '$lib/logger'
import {r4} from '$lib/r4'
import {r5} from '$lib/r5'

// Disable server-side rendering for all routes by default. Otherwise we can't use pglite + indexeddb.
export const ssr = false

const log = logger.ns('layout').seal()

// /** @type {import('@electric-sql/pglite/live').PGliteWithLive} */
// let pg

// /** Sync if no channels exist locally */
// async function autoPull() {
// 	const {rows} = await pg.sql`SELECT COUNT(*) as count FROM channels`
// 	const channelCount = Number(rows[0].count)
// 	if (channelCount > 100) return
// 	log.log('autoPull')
// 	await r5.channels.pull().catch((err) => log.error('auto_sync_error', err))
// }

async function preload() {
	if (!browser) {
		log.warn('preloading_failed_no_browser')
		return
	}
	log.debug('preloading')
	try {
		// PGlite removed - now using TanStack collections with localStorage
		await initAppState()
		await validateListeningState()

		// Preload disabled - testing on-demand fetching via TanStack collections
		// const {channelsCollection, preloadChannels} = await import('$lib/collections')
		// const channelCount = channelsCollection.toArray.length
		// if (channelCount < 100) {
		// 	log.log('autoPull', {channelCount})
		// 	await preloadChannels()
		// 	log.log('channels_preloaded', channelsCollection.toArray.length)
		// }

		// @ts-expect-error debugging
		window.r5 = {r5, r4}
	} catch (err) {
		log.error('preloading_error', err)
	} finally {
		log.debug('preloading_done')
	}
}

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	return {
		preloading: preload(),
		preload
	}
}
