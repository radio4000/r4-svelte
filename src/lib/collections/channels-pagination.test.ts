import {afterEach, expect, test, vi} from 'vitest'
import {createLiveQueryCollection, createLiveQueryObserver, gte, isNull, not} from '@tanstack/db'
import {channelsCollection} from './channels'
import {queryClient} from './query-client'

// Exercise the real query adapter and DB lifecycle, with deterministic server rows.
const rows = Array.from({length: 1050}, (_, i) => ({
	id: String(i).padStart(4, '0'),
	slug: `channel-${i}`,
	name: `Channel ${String(i).padStart(4, '0')}`,
	created_at: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
	track_count: i % 3 === 0 ? 100 : 20,
	image: i % 2 ? null : 'artwork.jpg'
}))

const responseSizes: number[] = []
const listings: ReturnType<typeof createLiveQueryCollection>[] = []
afterEach(async () => {
	for (const listing of listings.splice(0)) await listing.cleanup()
	await channelsCollection.cleanup()
	queryClient.clear()
	vi.restoreAllMocks()
	responseSizes.length = 0
})

function mockServer() {
	let randomRequest = 0
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		let result = [...rows]
		if (url.pathname.endsWith('/random_channels_with_tracks')) {
			const start = (randomRequest++ * 100) % rows.length
			result = [...rows.slice(start), ...rows.slice(0, start)]
		}
		const min = url.searchParams.get('track_count')
		if (min?.startsWith('gte.'))
			result = result.filter((row) => row.track_count >= Number(min.slice(4)))
		for (const field of ['id', 'created_at', 'name', 'track_count'] as const) {
			const value = url.searchParams.get(field)
			if (value?.startsWith('eq.'))
				result = result.filter((row) => String(row[field]) === value.slice(3))
		}
		if (url.searchParams.has('image')) result = result.filter((row) => row.image !== null)
		if (url.searchParams.get('order')?.includes('desc')) result.reverse()
		const offset = Number(url.searchParams.get('offset') ?? 0)
		const limit = Number(url.searchParams.get('limit') ?? 1000)
		const page = result.slice(offset, offset + limit)
		responseSizes.push(page.length)
		return new Response(JSON.stringify(page), {
			headers: {'Content-Type': 'application/json'}
		})
	})
}

function listing(limit?: number, min = 10, artwork = false, direction: 'asc' | 'desc' = 'asc') {
	const result = createLiveQueryCollection({
		query: (q) => {
			let query = q.from({ch: channelsCollection}).where(({ch}) => gte(ch.track_count, min))
			if (artwork) query = query.where(({ch}) => not(isNull(ch.image)))
			query = query
				.orderBy(({ch}) => ch.created_at, {direction, stringSort: 'lexical'})
				.orderBy(({ch}) => ch.id, {direction: 'asc', stringSort: 'lexical'})
			return limit === undefined ? query : query.limit(limit)
		},
		gcTime: 1
	})
	listings.push(result)
	return result
}

test('unlimited demand drains all backend pages instead of declaring 20 rows complete', async () => {
	mockServer()
	const all = listing()
	await all.preload()
	expect(all.toArray.map((row) => row.id)).toEqual(rows.map((row) => row.id))
})

test('page transitions and load more retain the full prefix with another reader mounted', async () => {
	mockServer()
	const otherReader = listing()
	await otherReader.preload()
	let previous = listing(12)
	await previous.preload()
	for (const limit of [24, 84, 96, 12, 84]) {
		const next = listing(limit)
		await next.preload()
		await previous.cleanup()
		expect(next.toArray.map((row) => row.id)).toEqual(rows.slice(0, limit).map((row) => row.id))
		previous = next
	}
})

test('changing filters and direction uses the matching rows across pages', async () => {
	mockServer()
	for (const [min, artwork, direction] of [
		[10, false, 'asc'],
		[100, true, 'desc'],
		[10, true, 'asc']
	] as const) {
		const result = listing(84, min, artwork, direction)
		await result.preload()
		const expected = rows.filter((row) => row.track_count >= min && (!artwork || row.image))
		if (direction === 'desc') expected.reverse()
		expect(result.toArray.map((row) => row.id)).toEqual(expected.slice(0, 84).map((row) => row.id))
	}
})

test('ordered continuations honor the requested offset without repeating earlier rows', async () => {
	const fetch = mockServer()
	const result = createLiveQueryCollection({
		query: (q) =>
			q
				.from({ch: channelsCollection})
				.where(({ch}) => gte(ch.track_count, 10))
				.orderBy(({ch}) => ch.created_at, {direction: 'asc', stringSort: 'lexical'})
				.limit(12)
	})
	listings.push(result)
	await result.preload()
	await result.utils.setWindow({limit: 84})
	expect(result.toArray.map((row) => row.id)).toEqual(rows.slice(0, 84).map((row) => row.id))
	const offsets = fetch.mock.calls.map(([input]) =>
		new URL(String(input)).searchParams.get('offset')
	)
	expect(offsets.some((offset) => Number(offset) > 0)).toBe(true)
})

test('zero limit stays empty and does not share an unlimited cache entry', async () => {
	mockServer()
	const empty = listing(0)
	await empty.preload()
	expect(empty.toArray).toEqual([])
	const all = listing()
	await all.preload()
	expect(all.toArray).toHaveLength(rows.length)
	expect(empty.toArray).toEqual([])
})

test('watching cached channels and browsing a page never requests the full directory', async () => {
	const fetch = mockServer()
	const watcher = createLiveQueryObserver(channelsCollection, {mode: 'wholesale'})
	const unsubscribe = watcher.subscribe(() => {})
	try {
		expect(fetch).not.toHaveBeenCalled()
		const page = listing(12)
		await page.preload()
		expect(page.toArray.map((row) => row.id)).toEqual(rows.slice(0, 12).map((row) => row.id))
		// The boundary equality may re-read a tied row, but never the directory.
		expect(responseSizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(13)
		expect(channelsCollection.size).toBe(12)
		expect(watcher.getSnapshot().data).toHaveLength(12)
	} finally {
		unsubscribe()
		watcher.dispose()
	}
})

test('shuffle keeps the cached prefix and resolves boundary ranks without another random draw', async () => {
	mockServer()
	let previousIds: string[] = []
	for (const limit of [12, 24, 84, 12, 24]) {
		const result = createLiveQueryCollection({
			query: (q) =>
				q
					.from({ch: channelsCollection})
					.where(({ch}) => gte(ch.track_count, 10))
					.where(({ch}) => gte(ch.shuffle, 0))
					.orderBy(({ch}) => ch.shuffle, 'asc')
					.orderBy(({ch}) => ch.id, {direction: 'asc', stringSort: 'lexical'})
					.limit(limit)
		})
		listings.push(result)
		await result.preload()
		const ids = result.toArray.map((row) => row.id)
		expect(ids).toHaveLength(limit)
		expect(ids.slice(0, Math.min(limit, previousIds.length))).toEqual(previousIds.slice(0, limit))
		previousIds = ids
	}
	expect(responseSizes).toEqual([12, 12, 60])
})

test('retiring the previous page after the new page is ready keeps requests bounded', async () => {
	mockServer()
	const first = listing(12)
	await first.preload()
	const second = listing(24)
	await second.preload()
	await first.cleanup()
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(second.toArray).toHaveLength(24)
	expect(channelsCollection.size).toBeLessThanOrEqual(24)
	expect(Math.max(...responseSizes)).toBeLessThanOrEqual(24)
})
