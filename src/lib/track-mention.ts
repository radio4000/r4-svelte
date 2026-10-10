/** Link a track mention to its source radio's tracks, not the mentioned radio.
 * Preserve filters only when already viewing that source radio. */
export function trackMentionUrl(url: URL, slug: string, mention: string, base = ''): string {
	const channelPath = `${base}/${encodeURIComponent(slug)}`
	const onSource = url.pathname === channelPath || url.pathname === `${channelPath}/tracks`
	const next = onSource ? new URL(url) : new URL(`${channelPath}/tracks`, url)
	next.pathname = `${channelPath}/tracks`
	next.searchParams.set('mention', mention.toLowerCase())
	next.searchParams.delete('page')
	next.searchParams.delete('offset')
	next.hash = ''
	return `${next.pathname}${next.search}`
}
