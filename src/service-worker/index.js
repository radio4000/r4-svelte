/*
 * Offline support. Built assets, static files and the app shell are cached on install;
 * pages are network-first (5s timeout), falling back to the last good copy or the shell,
 * so a full page load always runs the latest deploy. A new worker waits until every tab closes,
 * or until app-update-banner.svelte posts SKIP_WAITING.
 */
import {self as sw} from '$app/service-worker'
import {immutable, assets} from '$app/manifest'
import {version} from '$app/env'
import {asset, resolve} from '$app/paths'

const ASSETS = `assets-${version}`
// Per build: an older page points at chunks this cache no longer has.
const PAGES = `pages-${version}`
const PAGES_MAX = 50
const NETWORK_TIMEOUT = 5000 // ms

// Same set the old Workbox config precached: no HTML, no source maps, no audio/video.
const PRECACHE_PATTERN = /\.(js|css|ico|png|svg|woff2|webp|webmanifest)$/
const precache = [
	...immutable.map(({path}) => resolve(/** @type {any} */ (path))),
	...assets.map(({path}) => asset(path))
].filter((path) => PRECACHE_PATTERN.test(path))
// Every page boots through env.js, which is in neither list above.
precache.push(resolve(/** @type {any} */ ('_app/env.js')))
// Any page renders the app client-side, so `/` doubles as the offline fallback.
// Standalone hosts serve it as a 404, so it's stored whatever the status.
const SHELL = resolve('/')
const precached = new Set(precache)

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(ASSETS).then(async (cache) => {
			await cache.addAll(precache)
			await cache.put(SHELL, await fetch(SHELL))
		})
	)
})

sw.addEventListener('activate', (event) => {
	// Drops previous versions and anything left by the old Workbox worker.
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== ASSETS && key !== PAGES).map((key) => caches.delete(key))
				)
			)
			.then(() => sw.clients.claim())
	)
})

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') sw.skipWaiting()
})

sw.addEventListener('fetch', (event) => {
	const {request} = event
	if (request.method !== 'GET') return
	const url = new URL(request.url)
	if (url.origin !== sw.location.origin) return

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request))
	} else if (precached.has(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)))
	}
})

/** @param {Request} request */
async function networkFirst(request) {
	const cache = await caches.open(PAGES)
	const network = fetch(request).then((response) => {
		// Not awaited: storing reads the whole body, the page shouldn't wait on that.
		if (response.ok)
			cache
				.put(request, response.clone())
				.then(() => trim(cache))
				.catch(() => {})
		return response
	})
	network.catch(() => {})
	// Slow or offline: serve the cached copy if there is one, else keep waiting on the network.
	const fallback = async () =>
		(await cache.match(request)) ?? (await caches.match(SHELL, {cacheName: ASSETS})) ?? network
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	const timeout = new Promise((resolve) => (timer = setTimeout(resolve, NETWORK_TIMEOUT)))
	try {
		const response = await Promise.race([network, timeout])
		return response ?? (await fallback())
	} catch {
		return fallback()
	} finally {
		clearTimeout(timer)
	}
}

/** Oldest entries first — cache.keys() keeps insertion order. @param {Cache} cache */
async function trim(cache) {
	const keys = await cache.keys()
	await Promise.all(keys.slice(0, -PAGES_MAX).map((key) => cache.delete(key)))
}
