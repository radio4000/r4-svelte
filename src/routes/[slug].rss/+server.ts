import {Feed} from 'feed'
import {sdk} from '@radio4000/sdk'
import type {Channel, Track} from '@radio4000/sdk'
import type {RequestHandler} from './$types'

const LIMIT = 200

/** Reads channels+tracks from v2 with v1 fallback **/
async function readChannel(slug: string): Promise<{channel: Channel; tracks: Track[]} | null> {
	const {data: v2} = await sdk.channels.readChannel(slug)
	if (v2) {
		const {data} = await sdk.channels.readChannelTracks(slug, LIMIT)
		return {channel: v2, tracks: data ?? []}
	}
	const {data: v1} = await sdk.firebase.readChannel(slug)
	if (!v1) return null
	const channel = sdk.firebase.parseChannel(v1)
	const {data} = await sdk.firebase.readTracks({slug})
	const tracks = (data?.slice(0, LIMIT) ?? []).map((t) => sdk.firebase.parseTrack(t, channel.id, slug))
	return {channel, tracks}
}

export const GET: RequestHandler = async ({params, url}) => {
	const result = await readChannel(params.slug)
	if (!result) return new Response('Not found', {status: 404})

	const {channel, tracks} = result
	const channelUrl = `${url.origin}/${params.slug}`

	const feed = new Feed({
		title: channel.name,
		description: channel.description ?? '',
		id: channelUrl,
		link: channelUrl,
		feed: `${channelUrl}.rss`,
		updated: new Date(channel.updated_at),
		generator: 'Radio4000'
	})

	for (const t of tracks) {
		feed.addItem({
			title: t.title,
			id: `${channelUrl}/tracks/${t.id}`,
			link: `${channelUrl}/tracks/${t.id}`,
			description: t.description ?? '',
			content: t.url ? `<p><a href="${t.url}">${t.url}</a></p>` : undefined,
			date: new Date(t.created_at)
		})
	}

	return new Response(feed.rss2(), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	})
}
