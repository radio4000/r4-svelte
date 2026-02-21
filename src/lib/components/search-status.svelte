<script>
	/**
	 * @typedef {Object} Props
	 * @property {string} searchQuery
	 * @property {number} channelCount
	 * @property {number} trackCount
	 */

	/** @type {Props} */
	let {searchQuery, channelCount, trackCount} = $props()

	const trimmed = $derived(searchQuery?.trim() || '')
	const isChannelSearch = $derived(trimmed.startsWith('@'))
	const parts = $derived(trimmed.split(' '))
	const channelSlug = $derived(isChannelSearch ? parts[0].slice(1) : '')
	const hasAdditionalQuery = $derived(isChannelSearch && parts.length > 1)
	const searchTerms = $derived(hasAdditionalQuery ? parts.slice(1).join(' ') : '')

	const statusText = $derived.by(() => {
		if (!trimmed) return ''

		if (isChannelSearch) {
			if (hasAdditionalQuery) {
				return `"${searchTerms}" in ${channelSlug} • ${trackCount} result${trackCount === 1 ? '' : 's'}`
			} else {
				return `viewing ${channelSlug}`
			}
		} else {
			return `"${trimmed}" • ${channelCount} channel${channelCount === 1 ? '' : 's'}, ${trackCount} track result${trackCount === 1 ? '' : 's'}`
		}
	})
</script>

<small>{statusText}</small>
