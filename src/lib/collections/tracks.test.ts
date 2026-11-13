import {afterEach, describe, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, eq, gt, gte, inArray} from '@tanstack/db'
import {tracksCollection} from './tracks'
import {queryClient} from './query-client'
import {writeImport} from '#lib/import'
import type {Channel, Track} from '#lib/types'

// The real query adapter and DB lifecycle against a fake PostgREST that, like ours,
// caps every response at 4000 rows.
const MAX_ROWS = 4000

function channel(slug: string, count: number) {
	return Array.from({length: count}, (_, i) => ({
		id: `${slug}-${String(i).padStart(5, '0')}`,
		slug,
		title: `Track ${i}`,
		url: `https://youtube.com/watch?v=${slug}${i}`,
		provider: 'youtube',
		media_id: i === 0 ? 'shared' : `${slug}${i}`,
		description: '',
		// Pairs share created_at, like an import, so pages need the id tie-break
		created_at: new Date(Date.UTC(2020, 0, 1) + Math.floor((count - i) / 2) * 60_000).toISOString(),
		updated_at: '2020-01-01T00:00:00.000Z'
	}))
}
const rows = [
	...channel('big', 4500),
	...channel('small', 30),
	...channel('other', 5),
	// Two channels whose tracks interleave in time
	...channel('alice', 40),
	...channel('bob', 40).map((r) => ({
		...r,
		created_at: r.created_at.replace(':00.000Z', ':30.000Z')
	}))
]

type Request = {query: URLSearchParams; signal?: AbortSignal | null}
const requests: Request[] = []
const lists: Array<{cleanup: () => Promise<void>}> = []
/** Server-side edits and latency, for the refresh tests */
const server = {delay: 0, removed: new Set<string>()}

afterEach(async () => {
	for (const l of lists.splice(0)) await l.cleanup()
	await tracksCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	requests.length = 0
	server.delay = 0
	server.removed.clear()
	vi.useRealTimers()
})

function mockServer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		const query = url.searchParams
		requests.push({query, signal: init?.signal})
		if (server.delay) await new Promise((resolve) => setTimeout(resolve, server.delay))
		let result = rows.filter((r) => !server.removed.has(r.id))
		for (const field of ['slug', 'id', 'media_id', 'created_at'] as const) {
			const value = query.get(field)
			if (value?.startsWith('eq.')) result = result.filter((r) => r[field] === value.slice(3))
			if (value?.startsWith('gt.')) result = result.filter((r) => r[field] > value.slice(3))
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
		return new Response(JSON.stringify(result.slice(offset, offset + limit)), {
			headers: {'Content-Type': 'application/json'}
		})
	})
}

async function load(build: Parameters<typeof createLiveQueryCollection>[0]['query']) {
	const list = createLiveQueryCollection({query: build})
	lists.push(list)
	await list.preload()
	return list.toArray as Array<(typeof rows)[number]>
}

const keys = () =>
	queryClient
		.getQueryCache()
		.getAll()
		.map((q) => q.queryKey)

const newest = (slug: string) =>
	rows
		.filter((r) => r.slug === slug)
		.toSorted((a, b) =>
			a.created_at === b.created_at
				? a.id.localeCompare(b.id)
				: b.created_at.localeCompare(a.created_at)
		)

describe('channel loads', () => {
	test('a channel over the 4000-row cap loads completely, without repeats', async () => {
		mockServer()
		const got = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, 'big'))
				.orderBy(({t}) => t.created_at, 'desc')
		)
		expect(got.map((r) => r.id)).toEqual(newest('big').map((r) => r.id))
		expect(requests.map((r) => r.query.get('offset'))).toEqual(['0', '4000'])
		expect(keys()).toContainEqual(['tracks', 'big'])
	})

	test('requests carry the abort signal', async () => {
		mockServer()
		await load((q) => q.from({t: tracksCollection}).where(({t}) => eq(t.slug, 'small')))
		expect(requests[0].signal).toBeInstanceOf(AbortSignal)
	})

	test('a one-slug list shares the channel key, so the second reader downloads nothing', async () => {
		mockServer()
		await load((q) => q.from({t: tracksCollection}).where(({t}) => eq(t.slug, 'small')))
		const before = requests.length
		const got = await load((q) =>
			q.from({t: tracksCollection}).where(({t}) => inArray(t.slug, ['small']))
		)
		expect(got).toHaveLength(30)
		expect(requests.length).toBe(before)
		expect(keys()).toEqual([['tracks', 'small']])
	})

	test('a window keeps its limit in the key, and a grown window asks from its offset', async () => {
		mockServer()
		const list = createLiveQueryCollection({
			query: (q) =>
				q
					.from({t: tracksCollection})
					.where(({t}) => eq(t.slug, 'big'))
					.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
					.limit(10)
		})
		lists.push(list)
		await list.preload()
		expect(keys()).toContainEqual(['tracks', 'big', 'limit', 10])
		await list.utils.setWindow({limit: 30})
		const ids = (list.toArray as typeof rows).map((r) => r.id)
		expect(ids).toEqual(
			newest('big')
				.slice(0, 30)
				.map((r) => r.id)
		)
		const continued = keys().find((k) => k.includes('offset'))
		expect(continued?.slice(0, 2)).toEqual(['tracks', 'big'])
		expect(requests.some((r) => Number(r.query.get('offset')) > 0)).toBe(true)
		// Never the whole 4500-row channel for a 30-row window; the tie check at the page
		// edge asks for just the rows sharing that created_at
		expect(keys()).not.toContainEqual(['tracks', 'big'])
		for (const r of requests) {
			expect(r.query.has('created_at') || Number(r.query.get('limit')) < MAX_ROWS).toBe(true)
		}
	})

	test('several slugs keep a list key', async () => {
		mockServer()
		const got = await load((q) =>
			q.from({t: tracksCollection}).where(({t}) => inArray(t.slug, ['small', 'other']))
		)
		expect(got).toHaveLength(35)
		expect(keys()).toContainEqual(['tracks', 'slugs', 'other', 'small'])
	})

	test('several slugs with a grown window read each channel from its first row', async () => {
		mockServer()
		const list = createLiveQueryCollection({
			query: (q) =>
				q
					.from({t: tracksCollection})
					.where(({t}) => inArray(t.slug, ['alice', 'bob']))
					.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
					.limit(10)
		})
		lists.push(list)
		await list.preload()
		await list.utils.setWindow({limit: 50})
		const merged = rows
			.filter((r) => r.slug === 'alice' || r.slug === 'bob')
			.toSorted((a, b) =>
				a.created_at === b.created_at
					? a.id.localeCompare(b.id)
					: b.created_at.localeCompare(a.created_at)
			)
		// The continuation's offset counts merged rows; each channel is asked from its own 0
		expect(requests.some((r) => Number(r.query.get('offset')) > 0)).toBe(false)
		expect((list.toArray as typeof rows).map((r) => r.id)).toEqual(
			merged.slice(0, 50).map((r) => r.id)
		)
	})

	test('a window the server cannot serve as asked fetches the whole channel instead', async () => {
		mockServer()
		// Ordered by title: the newest 5 would be the wrong 5
		const byTitle = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, 'small'))
				.orderBy(({t}) => t.title, 'asc')
				.limit(5)
		)
		expect(byTitle.map((r) => r.title)).toEqual(
			newest('small')
				.map((r) => r.title)
				.toSorted((a, b) => a.localeCompare(b))
				.slice(0, 5)
		)
		// A filter we don't fetch by: the limit would cut before the filter
		const filtered = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, 'small'))
				.where(({t}) => gte(t.title, 'Track 2'))
				.orderBy(({t}) => t.created_at, 'desc')
				.limit(50)
		)
		expect(filtered.map((r) => r.title).toSorted()).toEqual(
			newest('small')
				.map((r) => r.title)
				.filter((t) => t >= 'Track 2')
				.toSorted()
		)
		for (const r of requests) expect(r.query.get('limit')).toBe(String(MAX_ROWS))
	})
})

const newestOf = (list: typeof rows) =>
	list.toSorted((a, b) =>
		a.created_at === b.created_at
			? a.id.localeCompare(b.id)
			: b.created_at.localeCompare(a.created_at)
	)

describe('lists across channels (explore, feed)', () => {
	test('the newest tracks of every channel load by window, and load more asks from its offset', async () => {
		mockServer()
		const list = createLiveQueryCollection({
			query: (q) =>
				q
					.from({t: tracksCollection})
					.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
					.limit(50)
		})
		lists.push(list)
		await list.preload()
		const all = newestOf(rows).map((r) => r.id)
		expect((list.toArray as typeof rows).map((r) => r.id)).toEqual(all.slice(0, 50))
		expect(keys()).toContainEqual(['tracks', 'all', 'limit', 50])
		await list.utils.setWindow({limit: 100})
		expect((list.toArray as typeof rows).map((r) => r.id)).toEqual(all.slice(0, 100))
		// Never the whole table, and never by channel
		for (const r of requests) {
			expect(r.query.has('slug')).toBe(false)
			expect(r.query.has('created_at') || Number(r.query.get('limit')) <= 50).toBe(true)
		}
	})

	test('many channels since a date take one request per 50 channels', async () => {
		mockServer()
		const slugs = ['small', 'other', 'alice', 'bob', ...Array.from({length: 60}, (_, i) => `x${i}`)]
		const since = rows.find((r) => r.slug === 'alice')?.created_at ?? ''
		const got = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => inArray(t.slug, slugs))
				.where(({t}) => gt(t.created_at, since))
				.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
		)
		const expected = newestOf(rows.filter((r) => slugs.includes(r.slug) && r.created_at > since))
		expect(got.map((r) => r.id)).toEqual(expected.map((r) => r.id))
		expect(requests).toHaveLength(2)
	})

	test('many channels since a date, newest 10, take one request per 50 channels', async () => {
		mockServer()
		const got = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => inArray(t.slug, ['alice', 'bob', 'small']))
				.where(({t}) => gt(t.created_at, '2000-01-01'))
				.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
				.limit(10)
		)
		const expected = newestOf(rows.filter((r) => ['alice', 'bob', 'small'].includes(r.slug)))
		expect(got.map((r) => r.id)).toEqual(expected.slice(0, 10).map((r) => r.id))
		expect(
			requests.filter(
				(r) => !r.query.get('created_at')?.startsWith('eq.')
			)
		).toHaveLength(1)
	})
})

describe('single tracks', () => {
	test('a live query for one track by id fetches just that track', async () => {
		mockServer()
		const got = await load((q) =>
			q.from({t: tracksCollection}).where(({t}) => eq(t.id, 'small-00003'))
		)
		expect(got.map((r) => r.id)).toEqual(['small-00003'])
		expect(requests).toHaveLength(1)
		expect(requests[0].query.get('id')).toBe('in.(small-00003)')
		expect(keys()).toContainEqual(['tracks', 'ids', 'small-00003'])
	})

	test('a track already loaded by id needs no request', async () => {
		mockServer()
		await load((q) => q.from({t: tracksCollection}).where(({t}) => eq(t.slug, 'small')))
		const before = requests.length
		const got = await load((q) =>
			q.from({t: tracksCollection}).where(({t}) => inArray(t.id, ['small-00001', 'small-00002']))
		)
		expect(got).toHaveLength(2)
		expect(requests.length).toBe(before)
	})

	test('tracks by media_id load across channels under their own key', async () => {
		mockServer()
		const got = await load((q) =>
			q.from({t: tracksCollection}).where(({t}) => eq(t.media_id, 'shared'))
		)
		expect(got.map((r) => r.slug).toSorted()).toEqual(['alice', 'big', 'bob', 'other', 'small'])
		expect(keys()).toContainEqual(['tracks', 'media', 'shared'])
		// Distinct from the related tab's hand-made ['tracks', 'media_id', …] entry
		expect(keys()).not.toContainEqual(['tracks', 'media_id', 'shared'])
	})
})

describe('returning to a channel', () => {
	const open = () =>
		load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, 'small'))
				.orderBy(({t}) => t.created_at, 'desc')
		)
	const leave = async () => {
		for (const l of lists.splice(0)) await l.cleanup()
	}
	const minutes = (n: number) => vi.setSystemTime(Date.now() + n * 60_000)

	test('within 5 minutes costs no request', async () => {
		mockServer()
		vi.useFakeTimers({toFake: ['Date']})
		await open()
		await leave()
		minutes(4)
		const before = requests.length
		expect(await open()).toHaveLength(30)
		expect(requests.length).toBe(before)
	})

	test('after 5 minutes shows the old rows at once and refreshes them in the background', async () => {
		mockServer()
		vi.useFakeTimers({toFake: ['Date']})
		await open()
		await leave()
		minutes(6)
		server.removed.add('small-00000')
		server.delay = 100
		const before = requests.length
		const list = createLiveQueryCollection({
			query: (q) =>
				q
					.from({t: tracksCollection})
					.where(({t}) => eq(t.slug, 'small'))
					.orderBy(({t}) => t.created_at, 'desc')
		})
		lists.push(list)
		await list.preload()
		// No wait for the network: the cached channel is on screen
		expect(list.toArray).toHaveLength(30)
		await new Promise((resolve) => setTimeout(resolve, 300))
		expect(requests.length - before).toBe(1)
		expect(list.toArray).toHaveLength(29)
	})
})

describe('a local channel (imported, nothing on the server)', () => {
	const local = channel('my-mixtape', 12) as unknown as Track[]
	const mixtape = {id: 'local-1', slug: 'my-mixtape', name: 'My mixtape'} as Channel
	const open = (where: 'eq' | 'in') =>
		load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) =>
					where === 'eq' ? eq(t.slug, 'my-mixtape') : inArray(t.slug, ['my-mixtape'])
				)
				.orderBy(({t}) => t.created_at, 'desc')
		)
	const leave = async () => {
		for (const l of lists.splice(0)) await l.cleanup()
	}

	test('keeps its tracks after the import, on return and after 5 minutes', async () => {
		mockServer()
		vi.useFakeTimers({toFake: ['Date']})
		await writeImport(mixtape, local)
		expect(await open('eq')).toHaveLength(12)
		expect(await open('in')).toHaveLength(12)
		await leave()
		expect(await open('eq')).toHaveLength(12)
		await leave()
		vi.setSystemTime(Date.now() + 6 * 60_000)
		expect(await open('eq')).toHaveLength(12)
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(tracksCollection.toArray.filter((t) => t.slug === 'my-mixtape')).toHaveLength(12)
		// Never asked the server about it
		expect(requests.some((r) => r.query.get('slug')?.includes('my-mixtape'))).toBe(false)
	})

	test('tracks without dates (an m3u) get the import time, first track newest', async () => {
		mockServer()
		const playlist = ['One', 'Two', 'Three'].map(
			(title, i) =>
				({id: `m3u-${i}`, slug: 'my-playlist', title, url: `https://x.test/${i}`}) as Track
		)
		await writeImport({id: 'local-2', slug: 'my-playlist', name: 'Playlist'} as Channel, playlist)
		const got = await load((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => eq(t.slug, 'my-playlist'))
				.orderBy(({t}) => t.created_at, 'desc')
		)
		expect(got.map((t) => t.title)).toEqual(['One', 'Two', 'Three'])
		expect(got.every((t) => !Number.isNaN(Date.parse(t.created_at)))).toBe(true)
	})
})
