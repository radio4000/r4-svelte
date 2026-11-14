import {afterEach, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, gte} from '@tanstack/db'
import {channelsCollection} from './channels'
import {queryClient} from './query-client'
import {getFeaturedPool} from './featured'

// Ten channels active in the last few days, ten a year ago; all with artwork and tracks
const day = 86400000
const rows = Array.from({length: 20}, (_, i) => ({
	id: `c${String(i).padStart(3, '0')}`,
	slug: `channel-${i}`,
	name: `Channel ${i}`,
	created_at: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
	image: 'image.jpg',
	track_count: 20 + i,
	latest_track_at: new Date(Date.now() - (i < 10 ? i + 1 : 365) * day).toISOString()
}))

const requests: URLSearchParams[] = []
const SINCE_DAY = /^gte\.\d{4}-\d{2}-\d{2}$/
afterEach(async () => {
	await channelsCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	requests.length = 0
})

function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		const query = url.searchParams
		requests.push(query)
		let result = [...rows]
		const since = query.get('latest_track_at')
		if (since?.startsWith('gte.')) result = result.filter((r) => r.latest_track_at >= since.slice(4))
		const count = query.get('track_count')
		if (count?.startsWith('gte.')) result = result.filter((r) => r.track_count >= Number(count.slice(4)))
		const offset = Number(query.get('offset') ?? 0)
		const limit = Number(query.get('limit') ?? 1000)
		return Response.json(result.slice(offset, offset + limit))
	})
}

test('the featured pool is the active channels, newest first, in one request', async () => {
	mockServer()
	const pool = await getFeaturedPool(30)
	expect(pool.map((c) => c.slug)).toEqual(rows.slice(0, 10).map((c) => c.slug))
	expect(requests).toHaveLength(1)
	expect(requests[0].get('latest_track_at')).toMatch(SINCE_DAY)
	expect(requests[0].get('image')).toBe('not.is.null')
})

test('another page unloading its channels does not refetch the pool', async () => {
	mockServer()
	await getFeaturedPool(30)
	// Like explore's grid: a list that loads channels, some in the pool, then leaves
	const list = createLiveQueryCollection({
		query: (q) => q.from({c: channelsCollection}).where(({c}) => gte(c.track_count, 25))
	})
	await list.preload()
	await list.cleanup()
	await new Promise((r) => setTimeout(r, 50))
	expect(requests).toHaveLength(2)
	expect((await getFeaturedPool(30)).map((c) => c.slug)).toEqual(
		rows.slice(0, 10).map((c) => c.slug)
	)
	expect(requests).toHaveLength(2)
})
