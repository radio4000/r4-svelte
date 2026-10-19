import {page} from '$app/state'
import {goto} from '$app/navigation'
import {parseTagsParam} from '#lib/views.js'

/**
 * URL-backed tag selection (?tags=a,b), shared by the channel page and its tracks
 * subpage so the same filter shows everywhere: chips row, description tags, popover
 * menu. Empty selection means no tag filter ("Latest"). The same param feeds
 * `channelViewFromUrl` — this helper only owns the toggle/clear UI side.
 */
export function getTagFilter() {
	const selectedTags = $derived(parseTagsParam(page.url.searchParams.get('tags')))

	function toggleTag(tag: string) {
		const normalized = tag.toLowerCase().trim()
		const next = selectedTags.some((t) => t.toLowerCase() === normalized)
			? selectedTags.filter((t) => t.toLowerCase() !== normalized)
			: [...selectedTags, normalized]
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL parsing for navigation, not reactive state
		const url = new URL(page.url.href)
		if (next.length) {
			url.searchParams.set('tags', next.join(','))
		} else {
			url.searchParams.delete('tags')
		}
		goto(url, {replace: true, reset: false})
	}

	function clearTags() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL parsing for navigation, not reactive state
		const url = new URL(page.url.href)
		url.searchParams.delete('tags')
		goto(url, {replace: true, reset: false})
	}

	return {
		get selectedTags() {
			return selectedTags
		},
		toggleTag,
		clearTags
	}
}
