import {afterEach, expect, test, vi} from 'vitest'
import {flushSync, mount, unmount} from 'svelte'
import {createLiveQueryCollection, eq} from '@tanstack/db'
import {tracksCollection} from '#lib/collections/tracks'
import {queryClient} from '#lib/collections/query-client'
import type {View} from '#lib/views'
import QueryViewHost from '#lib/test-hosts/query-view.svelte'

// One channel, every third track tagged #jazz
const rows = Array.from({length: 30}, (_, i) => ({
	id: `jz-${String(i).padStart(3, '0')}`,
	slug: 'jz',
	title: `Song ${i}`,
	url: `https://youtube.com/watch?v=jz${i}`,
	provider: 'youtube',
	media_id: `jz${i}`,
	description: i % 3 === 0 ? 'late night #jazz' : 'something else',
	created_at: new Date(Date.UTC(2020, 0, 1, 0, 30 - i)).toISOString(),
	updated_at: '2020-01-01T00:00:00.000Z'
}))

const trackRequests: string[] = []
function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		let body: unknown[] = []
		if (url.pathname.endsWith('/channel_tracks')) {
			trackRequests.push(url.search)
			const slug = url.searchParams.get('slug')
			body = rows.filter((r) => slug === `eq.${r.slug}`)
		}
		return new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json'}})
	})
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const cleanups: Array<() => unknown> = []

afterEach(async () => {
	for (const c of cleanups.splice(0)) await c()
	await tracksCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	trackRequests.length = 0
})

/** The channel layout's query, which a channel page keeps open. */
async function openChannel(slug: string) {
	const layout = createLiveQueryCollection((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)
	cleanups.push(() => layout.cleanup())
	await layout.preload()
	return layout
}

function mountView(getView: () => View) {
	let result: {strategy: string; tracks: Array<{title: string}>; loading: boolean} | undefined
	const host = mount(QueryViewHost, {
		target: document.body,
		props: {getView, expose: (v: typeof result) => (result = v)}
	})
	cleanups.push(() => unmount(host))
	flushSync()
	return () => {
		if (!result) throw new Error('queryView host did not mount')
		return result
	}
}

test('a tag view and a search on an open channel read its loaded tracks and download nothing', async () => {
	mockServer()
	await openChannel('jz')
	expect(trackRequests).toHaveLength(1)

	let view = $state<View>({sources: [{channels: ['jz'], tags: ['jazz']}]})
	const result = mountView(() => view)
	await settle()
	expect(result().strategy).toBe('channel-filtered')
	expect(result().loading).toBe(false)
	expect(result().tracks.map((t) => t.title)).toEqual(
		rows.filter((r) => r.description.includes('#jazz')).map((r) => r.title)
	)

	view = {sources: [{channels: ['jz'], search: 'Song 12'}]}
	flushSync()
	await settle()
	expect(result().tracks[0]?.title).toBe('Song 12')

	// Both answered from the channel's one cache entry
	expect(trackRequests).toHaveLength(1)
})
