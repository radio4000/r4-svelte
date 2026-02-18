import {Feed} from 'feed'
import {sdk} from '@radio4000/sdk'
import type {RequestHandler} from './$types'

const LIMIT = 200

export const GET: RequestHandler = async ({params, url}) => {
	const {data: channel} = await sdk.channels.readChannel(params.slug)
	if (!channel) return new Response('Not found', {status: 404})

	const {data} = await sdk.channels.readChannelTracks(params.slug, LIMIT)
	const tracks = data ?? []

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
