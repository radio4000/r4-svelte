/**
 * Mix builder - fluent API for creating playlists.
 *
 * Example:
 *   mix()
 *     .from('starttv')
 *     .from('otherChannel')
 *     .shuffle()
 *     .take(50)
 */

import {tracksCollection} from '$lib/tanstack/collections'
import {queueUnique} from '$lib/player/queue'
import {shuffleArray} from '$lib/utils'

type Track = {
	id: string
	slug?: string | null
	created_at: string
	url?: string
	playback_error?: string | null
	tags?: string[] | null
	description?: string | null
}

interface Mix {
	ids: () => string[]
	tracks: () => Track[]
	count: () => number
	clone: () => Mix
	from: (slug: string) => Mix
	shuffle: () => Mix
	unique: () => Mix
	take: (n: number) => Mix
	withoutErrors: () => Mix
	withTag: (tag: string) => Mix
}

function getTracksBySlug(slug: string): Track[] {
	return [...tracksCollection.state.values()].filter((t) => t.slug === slug) as Track[]
}

function createMix(initial: Track[] = []): Mix {
	let tracks = [...initial]

	const self: Mix = {
		ids: () => tracks.map((t) => t.id),
		tracks: () => [...tracks],
		count: () => tracks.length,
		clone: () => createMix([...tracks]),

		from(slug: string) {
			const channelTracks = getTracksBySlug(slug)
			tracks = [...tracks, ...channelTracks]
			return self
		},

		shuffle() {
			tracks = shuffleArray(tracks)
			return self
		},

		unique() {
			const ids = queueUnique(tracks.map((t) => t.id))
			tracks = ids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => Boolean(t))
			return self
		},

		take(n: number) {
			tracks = tracks.slice(0, n)
			return self
		},

		withoutErrors() {
			tracks = tracks.filter((t) => !t.playback_error)
			return self
		},

		withTag(tag: string) {
			const normalized = tag.toLowerCase().replace(/^#/, '')
			tracks = tracks.filter((t) => {
				if (t.tags?.some((x) => x.toLowerCase() === normalized)) return true
				return t.description?.toLowerCase().includes(`#${normalized}`)
			})
			return self
		}
	}

	return self
}

/** Start a new mix */
export function mix(): Mix {
	return createMix()
}

/** Start a mix from all loaded tracks */
export function mixAll(): Mix {
	const allTracks = [...tracksCollection.state.values()] as Track[]
	return createMix(allTracks)
}
