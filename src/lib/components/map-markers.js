// Channel marker styling + GeoJSON building for map-channels.svelte.
import {channelsCollection} from '#lib/collections/channels.js'

/**
 * @typedef {{
 *   favoriteIds: Set<string>,
 *   broadcastingIds: Set<string>,
 *   playingSlugs: Set<string>,
 *   inDeckSlugs: Set<string>
 * }} ChannelActivity
 * @typedef {{
 *   favoriteBroadcastFill: string,
 *   broadcastingFill: string,
 *   activeFill: string,
 *   favoriteFill: string,
 *   normalFill: string,
 *   favoriteBroadcastStroke: string,
 *   broadcastingStroke: string
 * }} MarkerPalette
 */

export function getLatestChannel(channel) {
	return channelsCollection.get(channel.id) || channel
}

/** @param {any} channel @param {ChannelActivity} activity */
export function getChannelState(channel, activity) {
	const current = getLatestChannel(channel)
	const isFavorite = activity.favoriteIds.has(current.id)
	const isBroadcasting = activity.broadcastingIds.has(current.id)
	const isPlaying = activity.playingSlugs.has(current.slug)
	const isInDeck = activity.inDeckSlugs.has(current.slug)
	const isActive = isBroadcasting || isPlaying || isInDeck
	return {isFavorite, isBroadcasting, isPlaying, isInDeck, isActive}
}

/**
 * 5-tier visual hierarchy: favorite+broadcasting > broadcasting > active > favorite > normal
 * mirrors channel card semantics while preserving favorite identity during live broadcast.
 * State is encoded by fill + radius; every marker shares the white ring / dark shadow outline.
 * @param {ReturnType<typeof getChannelState>} state @param {MarkerPalette} palette
 */
export function getMarkerStyle(state, palette) {
	if (state.isFavorite && state.isBroadcasting) {
		return {radius: 10, fillColor: palette.favoriteBroadcastFill, strokeWidth: 3}
	}
	if (state.isBroadcasting) {
		return {radius: 9, fillColor: palette.broadcastingFill, strokeWidth: 3}
	}
	if (state.isActive) {
		return {radius: 8, fillColor: palette.activeFill, strokeWidth: 2}
	}
	if (state.isFavorite) {
		return {radius: 7, fillColor: palette.favoriteFill, strokeWidth: 2}
	}
	return {radius: 5, fillColor: palette.normalFill, strokeWidth: 1.5}
}

/** @param {any[]} channels @param {ChannelActivity} activity @param {MarkerPalette} palette @returns {GeoJSON.FeatureCollection} */
export function buildChannelsGeoJSON(channels, activity, palette) {
	return {
		type: 'FeatureCollection',
		features: channels.map((c) => {
			const state = getChannelState(c, activity)
			const style = getMarkerStyle(state, palette)
			/** @type {GeoJSON.Feature} */
			return {
				type: 'Feature',
				geometry: {type: 'Point', coordinates: [c.longitude, c.latitude]},
				properties: {
					id: c.id,
					slug: c.slug,
					radius: style.radius,
					fillColor: style.fillColor,
					strokeWidth: style.strokeWidth,
					isBroadcasting: state.isBroadcasting,
					isFavorite: state.isFavorite,
					broadcastRingColor: state.isFavorite
						? palette.favoriteBroadcastStroke
						: palette.broadcastingStroke
				}
			}
		})
	}
}
