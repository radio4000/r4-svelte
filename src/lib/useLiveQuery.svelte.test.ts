import {expect, test} from 'vitest'
import {flushSync} from 'svelte'
import {BasicIndex, createCollection} from '@tanstack/db'
import {QueryClient} from '@tanstack/query-core'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'
import {useLiveQuery} from './useLiveQuery.svelte'

const rows = Array.from({length: 300}, (_, i) => ({
	id: `t${String(i).padStart(3, '0')}`,
	created_at: new Date(Date.UTC(2020, 0, 1, 0, 300 - i)).toISOString()
}))
type Row = (typeof rows)[number]

/**
 * An on-demand source that serves the newest-first window it is asked for, and logs it.
 * Indexed like tracks and channels: without an index on the order, DB asks for the
 * whole prefix again instead of the next page.
 */
function source() {
	const requests: Array<{limit?: number; offset?: number}> = []
	const items = createCollection(
		queryCollectionOptions({
			autoIndex: 'eager',
			defaultIndexType: BasicIndex,
			queryClient: new QueryClient(),
			syncMode: 'on-demand',
			getKey: (r: Row) => r.id,
			queryKey: (o) => [
				'items',
				JSON.stringify({...parseLoadSubsetOptions(o), offset: (o as {offset?: number})?.offset})
			],
			queryFn: async (ctx) => {
				const o = ctx.meta?.loadSubsetOptions as {limit?: number; offset?: number}
				requests.push({limit: o?.limit, offset: o?.offset})
				await new Promise((resolve) => setTimeout(resolve, 5))
				const from = o?.offset ?? 0
				return rows.slice(from, from + (o?.limit ?? rows.length))
			}
		})
	)
	return {items, requests}
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

test('load more moves the window of the same live query and asks only for the next page', async () => {
	const {items, requests} = source()
	let limit = $state(50)
	let query: {data: Row[]; collection: unknown} | undefined
	const stop = $effect.root(() => {
		query = useLiveQuery((q) =>
			q
				.from({t: items})
				.orderBy(({t}) => t.created_at, {direction: 'desc', stringSort: 'lexical'})
				.limit(limit)
		) as unknown as typeof query
	})
	flushSync()
	await settle()
	expect(query?.data.map((r) => r.id)).toEqual(rows.slice(0, 50).map((r) => r.id))
	const first = query?.collection
	const asked = requests.length

	limit = 100
	flushSync()
	await settle()
	expect(query?.data.map((r) => r.id)).toEqual(rows.slice(0, 100).map((r) => r.id))
	// The same live query, moved; not a new one asking for the first 100 again
	expect(query?.collection).toBe(first)
	const more = requests.slice(asked).filter((r) => r.limit !== undefined)
	expect(more.length).toBeGreaterThan(0)
	for (const r of more) expect(r.offset).toBeGreaterThanOrEqual(50)
	stop()
})
