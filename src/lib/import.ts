import {channelsCollection} from '$lib/collections/channels'
import {tracksCollection} from '$lib/collections/tracks'
import {queryClient} from '$lib/collections/query-client'
import {appState} from '$lib/app-state.svelte'
import {uuid, slugify} from '$lib/utils'
import type {Channel, Track, ImportOrigin} from '$lib/types'

const M3U_EXT_RE = /\.m3u8?$/i

export interface BackupData {
	channel: Channel
	tracks: Track[]
}

export interface ImportResult {
	channel: Channel
	imported: number
	alreadyImported?: boolean
}

export function importedSlug(slug: string, id: string): string {
	return `${slug}-import-${id.slice(0, 8)}`
}

export function validateBackup(data: unknown): asserts data is BackupData {
	if (!data || typeof data !== 'object') throw new Error('Not a valid JSON object.')
	const d = data as Record<string, unknown>
	if (!d.channel || typeof d.channel !== 'object') throw new Error('Missing channel.')
	const ch = d.channel as Record<string, unknown>
	if (!ch.id) throw new Error('Missing channel.id.')
	if (!ch.slug) throw new Error('Missing channel.slug.')
	if (!ch.name) throw new Error('Missing channel.name.')
	if (!Array.isArray(d.tracks)) throw new Error('Missing tracks array.')
	for (let i = 0; i < d.tracks.length; i++) {
		const t = d.tracks[i]
		if (!t?.url) throw new Error(`Track ${i}: missing url.`)
	}
}

/** Parse an `r4 download` channel `.txt` file. */
export function parseTxtFile(
	content: string,
	fallbackName: string
): {name: string; slug: string; description: string; id: string} {
	const lines = content.split('\n')
	const name = lines[0]?.trim() || fallbackName
	const infoLineIdx = lines.findIndex((l) => l.trim() === 'Info:')
	const descLines = infoLineIdx > 2 ? lines.slice(2, infoLineIdx) : lines.slice(2)
	const description = descLines.join('\n').trim()
	let slug = fallbackName
	let id: string = uuid()
	if (infoLineIdx !== -1) {
		for (const line of lines.slice(infoLineIdx + 1)) {
			const m = line.match(/^\s+(\w+):\s+(.+)$/)
			if (m) {
				if (m[1] === 'Slug') slug = m[2].trim()
				if (m[1] === 'ID') id = m[2].trim()
			}
		}
	}
	return {name, slug, description, id}
}

/** Parse an M3U playlist. Only includes tracks with http URLs (skips local paths). */
export function parseM3u(content: string): {title: string; url: string}[] {
	const lines = content.split('\n').map((l) => l.trim())
	const tracks: {title: string; url: string}[] = []
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('#EXTINF:')) {
			const commaIdx = lines[i].indexOf(',')
			const title = commaIdx !== -1 ? lines[i].slice(commaIdx + 1).trim() : 'Untitled'
			const url = lines[i + 1]
			if (url && url.startsWith('http')) {
				tracks.push({title, url})
				i++ // skip URL line
			}
		}
	}
	return tracks
}

/** Parse an `r4 download` track sidecar `.txt` file. */
export function parseTrackTxt(content: string): {title: string; description: string; url: string} {
	const lines = content.split('\n')
	const title = lines[0]?.trim() || 'Untitled'
	const urlLine = [...lines].reverse().find((l) => l.trim().startsWith('http'))
	const url = urlLine?.trim() || ''
	const urlLineIdx = urlLine ? lines.lastIndexOf(urlLine) : lines.length
	const description = lines.slice(1, urlLineIdx).join('\n').trim()
	return {title, description, url}
}

/** Write a channel + tracks into local collections. */
export async function writeImport(channel: Channel, tracks: Track[], origin?: ImportOrigin): Promise<void> {
	await Promise.all([
		channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload(),
		tracksCollection.isReady() ? Promise.resolve() : tracksCollection.preload()
	])

	channelsCollection.utils.writeUpsert(channel)
	queryClient.setQueryData(['channels', channel.slug], [channel])

	tracksCollection.utils.writeBatch(() => {
		for (const t of tracks) tracksCollection.utils.writeUpsert(t)
	})
	queryClient.setQueryData(['tracks', channel.slug], tracks)

	if (!appState.local_channel_ids?.includes(channel.id)) {
		appState.local_channel_ids = [...(appState.local_channel_ids ?? []), channel.id]
	}
	if (origin) {
		appState.local_channel_origins = {...(appState.local_channel_origins ?? {}), [channel.id]: origin}
	}
}

/** Remove a local-only imported channel and its tracks. Reverses writeImport. */
export function deleteLocalChannel(channelId: string, slug: string) {
	tracksCollection.utils.writeBatch(() => {
		for (const t of tracksCollection.toArray) {
			if (t.slug === slug) tracksCollection.utils.writeDelete(t.id)
		}
	})
	channelsCollection.utils.writeDelete(channelId)
	queryClient.removeQueries({queryKey: ['tracks', slug]})
	queryClient.removeQueries({queryKey: ['channels', slug]})
	appState.local_channel_ids = appState.local_channel_ids?.filter((id) => id !== channelId)
	if (appState.local_channel_origins) {
		const {[channelId]: _, ...rest} = appState.local_channel_origins
		appState.local_channel_origins = rest
	}
}

// --- URL-based imports (for auto-seed loading) ---

/** Deterministic 8-char hex ID from a URL string, for stable dedup. */
function urlId(url: string): string {
	let h = 0
	for (let i = 0; i < url.length; i++) {
		h = (Math.imul(31, h) + url.charCodeAt(i)) >>> 0
	}
	return h.toString(16).padStart(8, '0')
}

/** YYYYMMDD from an ISO date string, or empty string if missing/invalid. */
function dateSuffix(isoDate: string | null | undefined): string {
	if (!isoDate) return ''
	return new Date(isoDate).toISOString().slice(0, 10).replace(/-/g, '')
}

/** Ensure channelsCollection is loaded from IDB before reading state. */
async function ensureChannelsReady(): Promise<void> {
	if (!channelsCollection.isReady()) await channelsCollection.preload()
}

/**
 * Import a channel from a URL. Type is inferred from the extension:
 * - `.json` → JSON backup
 * - `.m3u` / `.m3u8` → M3U playlist
 * - `.txt` → `r4 download` channel file (auto-discovers sibling `tracks.m3u`)
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
	const lower = url.split('?')[0].toLowerCase()
	if (M3U_EXT_RE.test(lower)) return _importM3uUrl(url)
	if (lower.endsWith('.txt')) return _importTxtUrl(url)
	return _importJsonUrl(url)
}

async function _importJsonUrl(url: string): Promise<ImportResult> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
	const data: unknown = await res.json()
	validateBackup(data)
	// Dedup key is the URL — same URL always maps to the same local channel,
	// so page refreshes don't re-import. Different files (backup vs download.json)
	// of the same channel get distinct slugs because their URLs differ.
	const date = dateSuffix(data.channel.updated_at ?? data.channel.created_at)
	const suffix = date ? `${date}-${urlId(url).slice(0, 4)}` : urlId(url)
	const slug = importedSlug(data.channel.slug, suffix)
	await ensureChannelsReady()
	const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
	if (existing) return {channel: existing, imported: 0, alreadyImported: true}
	const {channel, tracks} = buildFromBackup(data, slug)
	await writeImport(channel, tracks, {type: 'url', url, importedAt: new Date().toISOString()})
	return {channel, imported: tracks.length}
}

async function _importM3uUrl(url: string): Promise<ImportResult> {
	const id = urlId(url)
	const name = url.split('/').pop()?.replace(M3U_EXT_RE, '') ?? 'playlist'
	const slug = importedSlug(slugify(name) || 'playlist', id)
	await ensureChannelsReady()
	const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
	if (existing) return {channel: existing, imported: 0, alreadyImported: true}
	const res = await fetch(url)
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
	const rawTracks = parseM3u(await res.text())
	if (!rawTracks.length) throw new Error('No playable tracks found.')
	const channelId = uuid()
	const channel = {id: channelId, slug, name, description: ''} as Channel
	const tracks = rawTracks.map((t) => ({id: uuid(), slug, title: t.title, url: t.url}) as Track)
	await writeImport(channel, tracks, {type: 'url', url, importedAt: new Date().toISOString()})
	return {channel, imported: tracks.length}
}

async function _importTxtUrl(url: string): Promise<ImportResult> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
	const fallback = url.split('/').pop()?.replace('.txt', '') ?? 'channel'
	const {name, slug, description} = parseTxtFile(await res.text(), fallback)
	const importSlug = importedSlug(slug, urlId(url))
	await ensureChannelsReady()
	const existing = [...channelsCollection.state.values()].find((c) => c.slug === importSlug)
	if (existing) return {channel: existing, imported: 0, alreadyImported: true}
	// Look for sibling tracks.m3u in the same directory
	const siblingUrl = new URL(url, location.href)
	siblingUrl.pathname = siblingUrl.pathname.replace(/[^/]+$/, 'tracks.m3u')
	const m3uRes = await fetch(siblingUrl).catch(() => null)
	const channelId = uuid()
	const channel = {id: channelId, slug: importSlug, name, description} as Channel
	const origin: ImportOrigin = {type: 'url', url, importedAt: new Date().toISOString()}
	if (m3uRes?.ok) {
		const rawTracks = parseM3u(await m3uRes.text())
		const tracks = rawTracks.map((t) => ({id: uuid(), slug: importSlug, title: t.title, url: t.url}) as Track)
		await writeImport(channel, tracks, origin)
		return {channel, imported: tracks.length}
	}
	await writeImport(channel, [], origin)
	return {channel, imported: 0}
}

/**
 * Auto-load seed data on startup (standalone mode).
 *
 * Sources are configured via PUBLIC_SEED_URLS (comma-separated list of URLs
 * set in .env — gitignored, survives git pull). Falls back to /r4-seed.json
 * if the env var is not set. Type is inferred from each URL's extension.
 */
export async function loadSeeds(seedUrls: string | undefined): Promise<void> {
	const urls = (seedUrls ?? '')
		.split(',')
		.map((u) => u.trim())
		.filter(Boolean)

	if (urls.length) {
		for (const url of urls) {
			await importFromUrl(url).catch((err) => console.warn('[r4] seed load failed', url, err))
		}
		return
	}

	// Fallback: single r4-seed.json
	const seedRes = await fetch('/r4-seed.json').catch(() => null)
	if (seedRes?.ok) {
		await _importJsonUrl('/r4-seed.json').catch((err) => console.warn('[r4] seed load failed', err))
	}
}

/** Import a JSON backup file. Always creates a new local channel — no dedup.
 * The slug suffix uses the backup's updated_at date (human-readable) plus a
 * short random id so the same channel can be imported multiple times as
 * distinct entries (e.g. remote backup vs local download.json). */
export async function importBackupFile(file: File): Promise<ImportResult> {
	const data: unknown = JSON.parse(await file.text())
	validateBackup(data)
	const date = dateSuffix(data.channel.updated_at ?? data.channel.created_at)
	const suffix = date ? `${date}-${uuid().slice(0, 4)}` : uuid().slice(0, 8)
	const slug = importedSlug(data.channel.slug, suffix)
	const {channel, tracks} = buildFromBackup(data, slug)
	await writeImport(channel, tracks, {type: 'file', importedAt: new Date().toISOString()})
	return {channel, imported: tracks.length}
}

/** Import an M3U playlist file. */
export async function importM3uFile(file: File): Promise<ImportResult> {
	const content = await file.text()
	const rawTracks = parseM3u(content)
	if (!rawTracks.length) throw new Error('No playable tracks found in playlist.')

	const baseName = file.name.replace(M3U_EXT_RE, '')
	const channelId = uuid()
	const slug = importedSlug(slugify(baseName) || 'playlist', channelId)

	const channel = {id: channelId, slug, name: baseName, description: ''} as Channel
	const tracks: Track[] = rawTracks.map((t) => ({id: uuid(), slug, title: t.title, url: t.url}) as Track)

	await writeImport(channel, tracks, {type: 'file', importedAt: new Date().toISOString()})
	return {channel, imported: tracks.length}
}

/** Build a Channel + Track[] from a validated BackupData object.
 * Pass a pre-computed slug to control the import identity (e.g. URL-keyed for seeds). */
export function buildFromBackup(data: BackupData, slug: string): {channel: Channel; tracks: Track[]} {
	const channelId = uuid()
	const channel: Channel = {...data.channel, id: channelId, slug}
	const tracks: Track[] = data.tracks.map((t) => ({...t, id: uuid(), slug}))
	return {channel, tracks}
}
