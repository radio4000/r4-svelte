import {sdk} from '@radio4000/sdk'
import {untrack} from 'svelte'
import {logger} from '$lib/logger'
import {viewLabel} from '$lib/views'

const log = logger.ns('presence').seal()

/** @param {Record<string, unknown[]>} rawState @returns {{ count: number }} */
function parsePresence(rawState) {
	return {count: Object.values(rawState).flat().length}
}

/** @param {Record<string, unknown[]>} rawState */
function parseChannelPresence(rawState) {
	const entries = /** @type {any[]} */ (Object.values(rawState).flat())
	/** @type {Record<string, number>} */
	const byUri = {}
	for (const e of entries) {
		if (e.uri) byUri[e.uri] = (byUri[e.uri] ?? 0) + 1
	}
	return {
		total: entries.length,
		broadcast: entries.filter((e) => e.mode === 'broadcast').length,
		autoRadio: entries.filter((e) => e.mode === 'auto-radio').length,
		byUri
	}
}

// ─── Reactive state (read in templates) ──────────────────────────────────────

/** @type {{ count: number }} */
export const appPresence = $state({count: 0})

/** @type {Record<string, { total: number, broadcast: number, autoRadio: number, byUri: Record<string, number> }>} */
export const channelPresence = $state({})

// ─── Internal channel map (not reactive — never read in templates) ────────────
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const channelMap = new Map() // slug → { ch, refCount, watching }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** @param {string} slug */
function initChannelPresence(slug) {
	untrack(() => {
		if (!channelPresence[slug]) channelPresence[slug] = {total: 0, broadcast: 0, autoRadio: 0, byUri: {}}
	})
}

/** @param {string} slug */
function resetChannelPresence(slug) {
	untrack(() => {
		channelPresence[slug] = {total: 0, broadcast: 0, autoRadio: 0, byUri: {}}
	})
}

/**
 * @param {string} slug
 * @param {any} ch
 */
function updateChannelPresence(slug, ch) {
	channelPresence[slug] = parseChannelPresence(ch.presenceState())
}

/** @param {string} slug */
function _ensureChannel(slug) {
	if (channelMap.has(slug)) return channelMap.get(slug)
	initChannelPresence(slug)
	const ch = sdk.supabase
		.channel(`presence:channel:${slug}`)
		.on('presence', {event: 'sync'}, () => updateChannelPresence(slug, ch))
		.on('presence', {event: 'join'}, () => updateChannelPresence(slug, ch))
		.on('presence', {event: 'leave'}, () => updateChannelPresence(slug, ch))
		.subscribe()
	const entry = {ch, refCount: 0, watching: false}
	channelMap.set(slug, entry)
	return entry
}

/** @param {string} slug */
function _maybeCleanup(slug) {
	const entry = channelMap.get(slug)
	if (!entry) return
	if (entry.refCount === 0 && !entry.watching) {
		entry.ch.unsubscribe()
		channelMap.delete(slug)
		resetChannelPresence(slug)
	}
}

// ─── App presence ─────────────────────────────────────────────────────────────

/** @type {any} */
let appPresenceChannel = null

export function trackAppPresence() {
	if (appPresenceChannel) return

	appPresenceChannel = sdk.supabase
		.channel('presence:app')
		.on('presence', {event: 'sync'}, () => {
			appPresence.count = parsePresence(appPresenceChannel.presenceState()).count
		})
		.on('presence', {event: 'join'}, () => {
			appPresence.count = parsePresence(appPresenceChannel.presenceState()).count
		})
		.on('presence', {event: 'leave'}, () => {
			appPresence.count = parsePresence(appPresenceChannel.presenceState()).count
		})
		.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				await appPresenceChannel.track({joined_at: new Date().toISOString()})
				log.log('app_presence_ready')
			}
		})
}

export async function untrackAppPresence() {
	if (!appPresenceChannel) return
	await appPresenceChannel.untrack()
	appPresenceChannel.unsubscribe()
	appPresenceChannel = null
	appPresence.count = 0
}

// ─── Channel presence ─────────────────────────────────────────────────────────

/**
 * Internal: track self on presence:channel:<slug>.
 * Refcounted — multiple callers share one connection.
 * @param {string} slug
 * @param {'broadcast' | 'auto-radio'} mode
 * @param {string} uri
 */
function _trackChannelPresence(slug, mode, uri) {
	const entry = _ensureChannel(slug)
	entry.refCount++
	entry.ch.track({joined_at: new Date().toISOString(), mode, uri}).catch(() => {})
}

/** @param {string} slug */
async function _untrackChannelPresence(slug) {
	const entry = channelMap.get(slug)
	if (!entry || entry.refCount === 0) return
	entry.refCount--
	if (entry.refCount === 0) await entry.ch.untrack()
	_maybeCleanup(slug)
}

// ─── Participants (track self) ────────────────────────────────────────────────

/** @param {string} slug */
export function trackBroadcastPresence(slug) {
	_trackChannelPresence(slug, 'broadcast', `@${slug}`)
}

/**
 * @param {string} slug
 * @param {import('$lib/views').View} [view]
 */
export function trackAutoRadioPresence(slug, view) {
	const uri = viewLabel(view ?? {queries: [{channels: [slug]}]}) || `@${slug}`
	_trackChannelPresence(slug, 'auto-radio', uri)
}

/** @param {string} slug */
export async function untrackBroadcastPresence(slug) {
	await _untrackChannelPresence(slug)
}

/** @param {string} slug */
export async function untrackAutoRadioPresence(slug) {
	await _untrackChannelPresence(slug)
}

// ─── Observer (channel page — no .track()) ───────────────────────────────────

/** @param {string} slug */
export function watchPresence(slug) {
	const entry = _ensureChannel(slug)
	entry.watching = true
}

/** @param {string} slug */
export function unwatchPresence(slug) {
	const entry = channelMap.get(slug)
	if (!entry) return
	entry.watching = false
	_maybeCleanup(slug)
}
