import {error} from '@sveltejs/kit'
import {getTracksCollection, getChannelsCollection} from '$lib/collections'
import {logger} from '$lib/logger'
import {r5} from '$lib/r5'

const log = logger.ns('track_route').seal()

/**
 * Load track + channel from collections
 * @type {import('./$types').PageLoad} */
export async function load({parent, params, depends}) {
	depends('track:meta')
	await parent()

	const {slug, tid} = params
	const tracksCollection = getTracksCollection()
	const channelsCollection = getChannelsCollection()

	// Try to find track in collection
	let track = tracksCollection.toArray.find((t) => t.id === tid)

	// If not found, pull from remote
	if (!track) {
		await r5.pull(slug)
		track = tracksCollection.toArray.find((t) => t.id === tid)
	}

	if (!track) error(404, 'Track not found')

	// Get channel from collection
	const channel = channelsCollection.toArray.find((c) => c.id === track.channel_id)
	if (!channel) error(404, 'Channel not found')

	// Verify the slug matches the channel
	if (channel.slug !== slug) {
		error(404, 'Track not found in this channel')
	}

	log.info('load', {track, channel})

	return {
		track,
		channel,
		slug,
		tid
	}
}
