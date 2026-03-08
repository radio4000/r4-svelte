import {channelsCollection} from '$lib/collections/channels'
import {tracksCollection} from '$lib/collections/tracks'
import {queryClient} from '$lib/collections/query-client'
import {appState} from '$lib/app-state.svelte'
import {uuid} from '$lib/utils'
import type {Channel, Track} from '$lib/types'

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
		if (!t?.id) throw new Error(`Track ${i}: missing id.`)
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
export async function writeImport(channel: Channel, tracks: Track[]): Promise<void> {
	await Promise.all([
		channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload(),
		tracksCollection.isReady() ? Promise.resolve() : tracksCollection.preload()
	])

	channelsCollection.utils.writeUpsert(channel)
	queryClient.setQueryData(['channels', channel.slug], [channel])

	const tracksToCache: Track[] = []
	tracksCollection.utils.writeBatch(() => {
		for (const t of tracks) {
			tracksCollection.utils.writeUpsert(t)
			tracksToCache.push(t)
		}
	})
	queryClient.setQueryData(['tracks', channel.slug], tracksToCache)

	if (!appState.local_channel_ids?.includes(channel.id)) {
		appState.local_channel_ids = [...(appState.local_channel_ids ?? []), channel.id]
	}
}

/** Build a Channel + Track[] from a validated BackupData object. */
export function buildFromBackup(data: BackupData): {channel: Channel; tracks: Track[]} {
	const slug = importedSlug(data.channel.slug, data.channel.id)
	const channelId = uuid()
	const channel: Channel = {...data.channel, id: channelId, slug}
	const tracks: Track[] = data.tracks.map((t) => ({...t, id: uuid(), slug}))
	return {channel, tracks}
}
