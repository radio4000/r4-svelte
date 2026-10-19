import {sdk} from '@radio4000/sdk'
import {searchChannels} from '#lib/search-fts.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {dedupeById, fuzzySearch} from '#lib/utils.js'

/**
 * Find channel by slug - tries local collection first, falls back to remote
 * @param {string} slug
 * @returns {Promise<import('#lib/types.js').Channel | undefined>}
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
 * `count` reflects the remote FTS total only (slug lookups and local fuzzy
 * matches are small, unpaginated bonuses layered on top).
 * @param {{slugs?: string[], query?: string, localChannels?: import('#lib/types.js').Channel[], limit?: number, offset?: number}} params
 * @returns {Promise<{channels: import('#lib/types.js').Channel[], count: number}>}
 */
export async function searchChannelsCombined({
	slugs = [],
	query = '',
	localChannels = [],
	limit = 100,
	offset = 0
} = {}) {
	/** @type {Promise<import('#lib/types.js').Channel[]>[]} */
	const promises = []
	let count = 0
	if (slugs.length) {
		promises.push(...slugs.map((slug) => findChannelBySlug(slug).then((c) => (c ? [c] : []))))
	}
	if (query) {
		const fts = await searchChannels(query, {limit, offset})
		count = fts.count
		promises.push(Promise.resolve(fts.channels))
		// Local fuzzy is a client-side bonus on top of the paginated FTS results —
		// only surface it on the first page, or it'd reappear on every page.
		if (offset === 0) {
			const local = searchChannelsLocal(query, localChannels)
			if (local.length) promises.push(Promise.resolve(local))
		}
	}
	if (!promises.length) return {channels: [], count: 0}
	const results = await Promise.all(promises)
	return {channels: dedupeById(results.flat()), count}
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
