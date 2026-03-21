import {sdk} from '@radio4000/sdk'
import {searchChannels} from '$lib/search-fts'
import {channelsCollection} from '$lib/collections/channels'
import {fuzzySearch} from '$lib/utils'

/**
 * Find channel by slug - tries local collection first, falls back to remote
 * @param {string} slug
 * @returns {Promise<import('$lib/types').Channel | undefined>}
 */
export async function findChannelBySlug(slug) {
	const normalizedSlug = String(slug || '')
		.trim()
		.toLowerCase()
	if (!normalizedSlug) return undefined
	const local = [...channelsCollection.state.values()].find(
		(c) =>
			String(c?.slug || '')
				.trim()
				.toLowerCase() === normalizedSlug
	)
	const localHasLocation =
		Number.isFinite(Number(local?.latitude)) && Number.isFinite(Number(local?.longitude))
	if (local && localHasLocation) return local
	const {data} = await sdk.channels.readChannel(normalizedSlug)
	return data ?? local ?? undefined
}

/**
 * Combined channel search: slug lookups + FTS + local fuzzy, deduplicated.
 * @param {{slugs?: string[], query?: string, localChannels?: import('$lib/types').Channel[]}} params
 * @returns {Promise<import('$lib/types').Channel[]>}
 */
export async function searchChannelsCombined({slugs = [], query = '', localChannels = []} = {}) {
	/** @type {Promise<import('$lib/types').Channel[]>[]} */
	const promises = []
	if (slugs.length) {
		promises.push(...slugs.map((slug) => findChannelBySlug(slug).then((c) => (c ? [c] : []))))
	}
	if (query) {
		promises.push(searchChannels(query))
		const local = searchChannelsLocal(query, localChannels)
		if (local.length) promises.push(Promise.resolve(local))
	}
	if (!promises.length) return []
	const results = await Promise.all(promises)
	const seen = new Set()
	return results.flat().filter((c) => {
		if (seen.has(c.id)) return false
		seen.add(c.id)
		return true
	})
}

/**
 * Fuzzy search channels locally
 * @param {string} query
 * @param {Array} channels
 * @param {{limit?: number}} options
 */
function searchChannelsLocal(query, channels, {limit = 100} = {}) {
	return fuzzySearch(query, channels, ['name', 'slug', 'description'], {limit})
}
