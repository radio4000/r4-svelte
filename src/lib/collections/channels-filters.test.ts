import {afterEach, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, eq, gt, inArray, isNull, not} from '@tanstack/db'
import {channelsCollection} from './channels'
import {queryClient} from './query-client'

// A filter the channels queryFn doesn't know used to be dropped, and the request became
// a listing of every channel (~4000 rows in four pages). These pin each filter we use.
const rows = Array.from({length: 300}, (_, i) => ({
	id: `c${String(i).padStart(3, '0')}`,
	slug: `channel-${i}`,
	name: `Channel ${i}`,
	created_at: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
	track_count: 20,
	latitude: i % 3 === 0 ? 55.6 : null,
	longitude: i % 3 === 0 ? 12.5 : i % 5 === 0 ? 10 : null
}))

const requests: URLSearchParams[] = []
const lists: Array<{cleanup: () => Promise<void>}> = []
afterEach(async () => {
	for (const l of lists.splice(0)) await l.cleanup()
	await channelsCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	requests.length = 0
})

function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		const query = url.searchParams
		requests.push(query)
		let result = [...rows]
		const slug = query.get('slug')
		if (slug?.startsWith('eq.')) result = result.filter((r) => r.slug === slug.slice(3))
		if (slug?.startsWith('in.')) {
			const set = new Set(slug.slice(4, -1).split(','))
			result = result.filter((r) => set.has(r.slug))
		}
		for (const field of ['latitude', 'longitude'] as const) {
			if (query.get(field) === 'not.is.null') result = result.filter((r) => r[field] !== null)
		}
		const offset = Number(query.get('offset') ?? 0)
		const limit = Number(query.get('limit') ?? 1000)
		const page = result.slice(offset, offset + limit)
		if (new Headers(init?.headers).get('Accept')?.includes('pgrst.object')) {
			return page.length === 1
				? Response.json(page[0])
				: Response.json({code: 'PGRST116', message: 'no rows'}, {status: 406})
		}
		return Response.json(page)
	})
}

async function load(build: Parameters<typeof createLiveQueryCollection>[0]['query']) {
	const list = createLiveQueryCollection({query: build})
	lists.push(list)
	await list.preload()
	return list.toArray as typeof rows
}

const listed = () => requests.some((q) => !q.has('slug') && q.has('offset'))

test('a slug list loads just those channels', async () => {
	mockServer()
	const got = await load((q) =>
		q.from({c: channelsCollection}).where(({c}) => inArray(c.slug, ['channel-4', 'channel-7']))
	)
	expect(got.map((c) => c.slug).toSorted()).toEqual(['channel-4', 'channel-7'])
	expect(requests.map((q) => q.get('slug'))).toEqual(['in.(channel-4,channel-7)'])
})

test('a one-slug list is a single channel lookup, not a listing', async () => {
	mockServer()
	const got = await load((q) =>
		q.from({c: channelsCollection}).where(({c}) => inArray(c.slug, ['channel-4']))
	)
	expect(got.map((c) => c.slug)).toEqual(['channel-4'])
	expect(listed()).toBe(false)
	expect(requests).toHaveLength(1)
})

test('latitude alone narrows on the server', async () => {
	mockServer()
	const got = await load((q) =>
		q.from({c: channelsCollection}).where(({c}) => not(isNull(c.latitude)))
	)
	expect(got).toHaveLength(rows.filter((r) => r.latitude !== null).length)
	expect(requests.every((q) => q.get('latitude') === 'not.is.null')).toBe(true)
	expect(requests.some((q) => q.has('longitude'))).toBe(false)
})

test('a filter the queryFn does not know warns, naming it', async () => {
	mockServer()
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	await load((q) =>
		q.from({c: channelsCollection}).where(({c}) => gt(c.created_at, '2020-01-01T02:00:00.000Z'))
	)
	expect(warn.mock.calls.flat().join(' ')).toContain('created_at gt')
})

test('known filters stay quiet', async () => {
	mockServer()
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	await load((q) => q.from({c: channelsCollection}).where(({c}) => eq(c.slug, 'channel-1')))
	expect(warn).not.toHaveBeenCalled()
})
