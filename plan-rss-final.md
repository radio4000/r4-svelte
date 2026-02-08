# RSS Feed for Channel Tracks — Final Plan

Synthesized from four independent LLM plans + clarifications.

## What

`/{slug}.rss` — RSS 2.0 feed of a channel's tracks. One new server endpoint, one small edit for autodiscovery. Supports both v2 and v1 channels. Uses the `feed` npm package for spec-correct XML generation.

## Files

| Action  | File                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| Install | `feed` (npm package)                                                                |
| Create  | `src/routes/[slug].rss/+server.ts`                                                  |
| Edit    | `src/routes/[slug]/+layout.svelte` — add `<link rel="alternate">` for autodiscovery |

## Route: `src/routes/[slug].rss/+server.ts`

SvelteKit treats `[slug].rss` as dynamic param + literal suffix → `/ko002.rss` yields `params.slug = 'ko002'`.

```ts
import {Feed} from 'feed'
import sdk from '@radio4000/sdk'
import type {RequestHandler} from './$types'

export const GET: RequestHandler = async ({params, url}) => {
	const {slug} = params

	// Try v2, fall back to v1
	let channel, tracks
	const {data: v2Channel} = await sdk.channels.readChannel(slug)
	if (v2Channel) {
		channel = v2Channel
		const {data} = await sdk.channels.readChannelTracks(slug, 200)
		tracks = data
	} else {
		const {data: v1Channel} = await sdk.firebase.readChannel(slug)
		if (!v1Channel) return new Response('Not found', {status: 404})
		channel = v1Channel
		const {data} = await sdk.firebase.readTracks({slug})
		tracks = data?.slice(0, 200)
	}

	const channelUrl = `${url.origin}/${slug}`

	const feed = new Feed({
		title: channel.name,
		description: channel.description ?? '',
		id: channelUrl,
		link: channelUrl,
		feed: `${channelUrl}.rss`,
		updated: new Date(channel.updated_at),
		generator: 'Radio4000'
	})

	for (const t of tracks ?? []) {
		feed.addItem({
			title: t.title,
			id: `${channelUrl}/tracks/${t.id}`,
			link: `${channelUrl}/tracks/${t.id}`,
			description: [t.description, t.url].filter(Boolean).join('\n'),
			date: new Date(t.created_at)
		})
	}

	return new Response(feed.rss2(), {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	})
}
```

## Autodiscovery: `src/routes/[slug]/+layout.svelte`

Inside the `{#if channel}` block, add:

```svelte
<svelte:head>
	<link rel="alternate" type="application/rss+xml" title={channel.name} href="/{slug}.rss" />
</svelte:head>
```

## Key decisions

| Decision            | Choice                                                | Why                                                                                           |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **`feed` library**  | Yes                                                   | Handles XML escaping, spec compliance, atom:link self. Gives us Atom/JSON Feed for free later |
| **v1 fallback**     | Try v2 first, v1 if 404                               | Both return `Track` type, same fields                                                         |
| **Item cap**        | 200                                                   | Keeps feeds lightweight                                                                       |
| **Cache**           | `max-age=3600`                                        | 1hr, avoids hammering DB                                                                      |
| **`<description>`** | `track.description` + `track.url` joined with newline | Subscribers see both the text and the playable link                                           |
| **Generator**       | `Radio4000`                                           | Identifies the feed source                                                                    |

## Verification

1. `bun run dev` → visit `http://localhost:5173/ko002.rss` (v2 channel)
2. Try a v1 channel slug too
3. Check XML is well-formed, items have titles/dates/links
4. Visit `/ko002` → inspect `<head>` for `<link rel="alternate">`
5. `bun run check && bun run types`
