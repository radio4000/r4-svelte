import type {Channel} from '#lib/types.js'

export function updateStableChannelId(
	slug: string,
	currentId: string,
	currentSourceSlug: string,
	found: Channel | undefined
) {
	if (!found?.id) return {channelId: currentId, channelIdSourceSlug: currentSourceSlug}
	if (found.id === currentId && currentSourceSlug === slug) {
		return {channelId: currentId, channelIdSourceSlug: currentSourceSlug}
	}
	return {channelId: found.id, channelIdSourceSlug: slug}
}

export function pickRouteChannel(
	slug: string,
	channelFromSlug: Channel | undefined,
	channelFromId: Channel | undefined
): Channel | undefined {
	if (channelFromSlug?.slug === slug) return channelFromSlug
	const candidate = channelFromId ?? channelFromSlug
	// A single-result live query in transition can briefly yield a truthy but empty
	// object ({}). Treat anything without an id as "not resolved" so callers don't
	// render a ghost channel (header flashing "@unknown" / "Tracks (0)").
	return candidate?.id ? candidate : undefined
}
