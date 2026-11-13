import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, eq, inArray} from '@tanstack/db'
import {tracksCollection} from '#lib/collections/tracks.js'
import {queryClient} from '#lib/collections/query-client.js'
import {loadChannelTracks, channelTracks} from './channel-tracks'

// The real tracks collection against a fake PostgREST capped at 4000 rows, like ours.
const MAX_ROWS = 4000

function channel(slug: string, count: number) {
	return Array.from({length: count}, (_, i) => ({
		id: `${slug}-${String(i).padStart(5, '0')}`,
		slug,
		title: `Track ${i}`,
		url: `https://youtube.com/watch?v=${slug}${i}`,
		provider: 'youtube',
		media_id: `${slug}${i}`,
		description: '',
		created_at: new Date(Date.UTC(2020, 0, 1) + (count - i) * 60_000).toISOString(),
		updated_at: '2020-01-01T00:00:00.000Z'
	}))
}
const rows = [...channel('big', 4500), ...channel('small', 30)]

const requests: URLSearchParams[] = []
const server = {delay: 0}
const cleanups: Array<() => unknown> = []

// Fake setTimeout so each test can step past the handoff, and none leaves a lease behind
beforeEach(() => {
	vi.useFakeTimers({toFake: ['setTimeout']})
})

afterEach(async () => {
	await vi.advanceTimersByTimeAsync(5000)
	vi.useRealTimers()
	for (const c of cleanups.splice(0)) await c()
	await tracksCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	requests.length = 0
	server.delay = 0
})

function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const query = new URL(input instanceof Request ? input.url : String(input)).searchParams
		requests.push(query)
		if (server.delay) await new Promise((resolve) => setTimeout(resolve, server.delay))
		let result = rows
		for (const field of ['slug', 'id'] as const) {
			const value = query.get(field)
			if (value?.startsWith('eq.')) result = result.filter((r) => r[field] === value.slice(3))
			if (value?.startsWith('in.')) {
				const set = new Set(value.slice(4, -1).split(','))
				result = result.filter((r) => set.has(r[field]))
			}
		}
		const offset = Number(query.get('offset') ?? 0)
		const limit = Math.min(Number(query.get('limit') ?? MAX_ROWS), MAX_ROWS)
		return new Response(JSON.stringify(result.slice(offset, offset + limit)), {
			headers: {'Content-Type': 'application/json'}
		})
	})
}

/** The channel page's query (`[slug]/+layout.svelte`). */
function channelPage(slug: string) {
	const list = createLiveQueryCollection({
		query: (q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, slug))
				.orderBy(({t}) => t.created_at, 'desc')
	})
	cleanups.push(() => list.cleanup())
	return list
}

/** The deck keepalive's pin (`tracks-keepalive.svelte`). */
function pin(where: Parameters<typeof tracksCollection.subscribeChanges>[1]) {
	const sub = tracksCollection.subscribeChanges(() => {}, {...where, includeInitialState: true})
	cleanups.push(() => sub.unsubscribe())
	return sub
}

describe('loadChannelTracks', () => {
	test('returns the whole channel newest first, past the 4000-row cap', async () => {
		mockServer()
		const got = await loadChannelTracks('big')
		expect(got).toHaveLength(4500)
		expect(got[0].id).toBe('big-00000')
		expect(got.at(-1)?.id).toBe('big-04499')
		expect(requests.map((r) => r.get('offset'))).toEqual(['0', '4000'])
	})

	test('keeps the rows in the collection after it returns, then lets them go', async () => {
		mockServer()
		const got = await loadChannelTracks('small')
		expect(tracksCollection.get(got[0].id)).toBeDefined()
		expect(channelTracks('small')).toHaveLength(30)
		await vi.advanceTimersByTimeAsync(5000)
		expect(channelTracks('small')).toHaveLength(0)
	})

	test('a deck pin taken during the handoff keeps the rows', async () => {
		mockServer()
		await loadChannelTracks('small')
		pin({where: (t) => eq(t.slug, 'small')})
		await vi.advanceTimersByTimeAsync(5000)
		expect(channelTracks('small')).toHaveLength(30)
	})

	test('a current-track pin by id taken during the handoff keeps that row', async () => {
		mockServer()
		await loadChannelTracks('small')
		const before = requests.length
		pin({where: (t) => inArray(t.id, ['small-00003'])})
		await vi.advanceTimersByTimeAsync(5000)
		expect(tracksCollection.get('small-00003')).toBeDefined()
		expect(requests.length).toBe(before)
	})

	test('a channel open on its page downloads nothing and stays loaded', async () => {
		mockServer()
		const page = channelPage('small')
		await page.preload()
		const before = requests.length
		const got = await loadChannelTracks('small')
		expect(got.map((t) => t.id)).toEqual(page.toArray.map((t) => t.id))
		expect(requests.length).toBe(before)
		await vi.advanceTimersByTimeAsync(5000)
		expect(channelTracks('small')).toHaveLength(30)
	})

	test('a channel browsed and left within the cache window downloads nothing', async () => {
		mockServer()
		const page = channelPage('small')
		await page.preload()
		await page.cleanup()
		const before = requests.length
		expect(await loadChannelTracks('small')).toHaveLength(30)
		expect(requests.length).toBe(before)
	})

	test('the page leaving while the load is in flight loses no rows', async () => {
		mockServer()
		server.delay = 20
		const page = channelPage('big')
		const opening = page.preload()
		const loading = loadChannelTracks('big')
		await page.cleanup()
		await vi.advanceTimersByTimeAsync(100)
		await opening.catch(() => {})
		const got = await loading
		expect(got).toHaveLength(4500)
		expect(channelTracks('big')).toHaveLength(4500)
	})

	test('two loads of one channel at once share one download', async () => {
		mockServer()
		const [a, b] = await Promise.all([loadChannelTracks('small'), loadChannelTracks('small')])
		expect(a).toHaveLength(30)
		expect(b).toHaveLength(30)
		expect(requests).toHaveLength(1)
	})
})
