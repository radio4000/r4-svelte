import {afterEach, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, eq, inArray} from '@tanstack/db'
import {tracksCollection} from './tracks'
import {queryClient} from './query-client'

// The real query adapter against a fake PostgREST that, like ours, caps responses at 4000 rows.
// Each case is a bug the key function had: a filter it did not understand got a key and
// a request of its own.
const MAX_ROWS = 4000

function channel(slug: string, count: number) {
	return Array.from({length: count}, (_, i) => ({
		id: `${slug}-${String(i).padStart(5, '0')}`,
		slug,
		title: `Track ${i}`,
		// Pairs share created_at, like an import, so pages need the id tie-break
		created_at: new Date(Date.UTC(2020, 0, 1) + Math.floor((count - i) / 2) * 60_000).toISOString()
	}))
}
const rows = [...channel('big', 4500), ...channel('small', 30)]

const requests: URLSearchParams[] = []
const lists: Array<{cleanup: () => Promise<void>}> = []

afterEach(async () => {
	for (const l of lists.splice(0)) await l.cleanup()
	await tracksCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	requests.length = 0
})

function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const query = new URL(input instanceof Request ? input.url : String(input)).searchParams
		requests.push(query)
		let result = [...rows]
		for (const field of ['slug', 'id'] as const) {
			const value = query.get(field)
			if (value?.startsWith('eq.')) result = result.filter((r) => r[field] === value.slice(3))
			if (value?.startsWith('in.')) {
				const set = new Set(value.slice(4, -1).split(','))
				result = result.filter((r) => set.has(r[field]))
			}
		}
		if (query.get('order')?.startsWith('created_at.desc')) {
			result.sort((a, b) =>
				a.created_at === b.created_at
					? a.id.localeCompare(b.id)
					: b.created_at.localeCompare(a.created_at)
			)
		}
		const offset = Number(query.get('offset') ?? 0)
		const limit = Math.min(Number(query.get('limit') ?? MAX_ROWS), MAX_ROWS)
		return Response.json(result.slice(offset, offset + limit))
	})
}

async function load(build: Parameters<typeof createLiveQueryCollection>[0]['query']) {
	const list = createLiveQueryCollection({query: build})
	lists.push(list)
	await list.preload()
	return list.toArray as typeof rows
}

const keys = () =>
	queryClient
		.getQueryCache()
		.getAll()
		.map((q) => q.queryKey)

test('a channel over the 4000-row cap loads whole, without repeats', async () => {
	mockServer()
	const got = await load((q) =>
		q
			.from({t: tracksCollection})
			.where(({t}) => eq(t.slug, 'big'))
			.orderBy(({t}) => t.created_at, 'desc')
	)
	expect(new Set(got.map((r) => r.id)).size).toBe(4500)
	expect(requests.map((q) => q.get('offset'))).toEqual(['0', '4000'])
})

test('a search or tag view on an open channel reuses its rows and downloads nothing', async () => {
	mockServer()
	// The channel layout's query
	await load((q) =>
		q
			.from({t: tracksCollection})
			.where(({t}) => eq(t.slug, 'small'))
			.orderBy(({t}) => t.created_at, 'desc')
	)
	const before = requests.length
	// What queryView asks for a filtered view of that channel (views.svelte.ts)
	const got = await load((q) =>
		q
			.from({t: tracksCollection})
			.where(({t}) => inArray(t.slug, ['small']))
			.orderBy(({t}) => t.created_at, 'desc')
	)
	expect(got).toHaveLength(30)
	expect(requests.length).toBe(before)
	expect(keys()).toEqual([['tracks', 'small']])
})

test('a track by id fetches just that track', async () => {
	mockServer()
	const got = await load((q) =>
		q.from({t: tracksCollection}).where(({t}) => eq(t.id, 'small-00003'))
	)
	expect(got.map((r) => r.id)).toEqual(['small-00003'])
	expect(requests.map((q) => q.get('id'))).toEqual(['in.(small-00003)'])
})
