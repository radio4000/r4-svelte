import {redirect} from '@sveltejs/kit'
import {browser} from '$app/env'
import {sdk} from '@radio4000/sdk'
import {fetchChannelCount} from '#lib/collections/channels.js'
import {appUrl} from '#lib/config.js'
import {capabilities} from '#lib/modes.js'
import {paginationFromUrl} from '#lib/utils.js'

// Opts back in from the root layout's `ssr = false`: this directory is how crawlers
// reach every channel. The collections are browser-only, so `load` feeds `Channels`.
export const ssr = true

const slugToFilter = {
	featured: 'featured',
	all: 'all',
	favorites: 'favorites',
	broadcasting: 'broadcasting',
	'with-artwork': 'artwork',
	imported: 'imported',
	'with-more-than-10-tracks': '10+',
	'with-more-than-100-tracks': '100+',
	'with-more-than-1000-tracks': '1000+'
}

/** Must match the `Channels` component: `paginationFromUrl(page.url, 12)`. */
const DEFAULT_PER = 12
/** Same ceiling the pagination dialog enforces — keeps `?per=99999` cheap. */
const MAX_PER = 200

/**
 * The one listing search engines may index — matches the sitemap's threshold.
 * Every other filter is a near-duplicate and gets `noindex, follow` instead.
 */
const INDEXABLE_SLUG = 'with-more-than-10-tracks'

/** True until this module's first `load` on the client — see the comment in `load`. */
let firstClientLoad = browser

/**
 * Filters whose listing can be rendered on the server. The rest
 * (favorites, broadcasting, imported) are per-visitor — nothing to crawl.
 * @type {Record<string, {minTracks?: number, hasImage?: boolean}>}
 */
const serverFilters = {
	all: {},
	'10+': {minTracks: 10},
	'100+': {minTracks: 100},
	'1000+': {minTracks: 1000},
	artwork: {minTracks: 2, hasImage: true},
	featured: {minTracks: 10, hasImage: true}
}

/** @type {import('./$types').PageLoad} */
export async function load({params, url}) {
	const filter = slugToFilter[params.filter]
	if (!filter) redirect(307, `/explore/channels/all${url.search}`)

	const {page, per} = paginationFromUrl(url, DEFAULT_PER)
	// The hydrating client run must return the same listing or the server-rendered
	// channels blink out. Later navigations skip the fetch — the collection has the
	// data by then, and blocking a page transition would make the chips sluggish.
	const needsListing = !browser || firstClientLoad
	firstClientLoad = false
	const directory = needsListing ? await fetchDirectory(filter, {page, per}) : null

	// `display` etc. only change how the same channels are drawn, so the canonical
	// drops them; `page` and `per` change *which* channels are here, so they stay.
	const canonicalQuery = new URLSearchParams()
	if (page > 1) canonicalQuery.set('page', String(page))
	if (per !== DEFAULT_PER) canonicalQuery.set('per', String(per))
	const query = canonicalQuery.toString()
	const path = `/explore/channels/${params.filter}`

	return {
		filter,
		directory,
		seo: {
			canonical: `${appUrl}${path}${query ? `?${query}` : ''}`,
			// The one filter we picked, at the default page size, with something on it.
			indexable:
				params.filter === INDEXABLE_SLUG && per === DEFAULT_PER && !!directory?.channels.length
		}
	}
}

const EMPTY = {channels: [], totalCount: 0}

/**
 * One page of the listing, plus the total. Feeds the same `Channels` component
 * the browser uses — see its `initialChannels` prop.
 * @param {string} filter
 * @param {{page: number, per: number}} pagination
 */
async function fetchDirectory(filter, {page, per}) {
	const predicates = serverFilters[filter]
	if (!predicates || !capabilities.globalBrowse) return EMPTY

	const size = Math.min(per, MAX_PER)
	let query = sdk.supabase
		.from('channels_with_tracks')
		.select('id, slug, name, description, image, track_count, latest_track_at, created_at')
	if (predicates.minTracks) query = query.gte('track_count', predicates.minTracks)
	if (predicates.hasImage) query = query.not('image', 'is', null)

	if (filter === 'featured') {
		// Featured is a rotating pick of 12, not a paged list.
		query = query.order('latest_track_at', {ascending: false}).range(0, size - 1)
	} else {
		// `created_at` never changes, so page boundaries stay put between crawls.
		const from = (page - 1) * size
		query = query.order('created_at', {ascending: true}).range(from, from + size - 1)
	}

	// Without a total, `Pagination` can't tell whether a next page exists.
	const [{data, error}, totalCount] = await Promise.all([
		query,
		filter === 'featured'
			? Promise.resolve(0)
			: fetchChannelCount({
					trackCountGte: predicates.minTracks,
					imageNotNull: predicates.hasImage
				})
	])

	// A failed listing shouldn't take the page down — the client renders anyway.
	if (error || !data) return EMPTY
	return {channels: data, totalCount}
}
