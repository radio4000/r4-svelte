import {expect, test} from 'vitest'
import {QueryClient} from '@tanstack/query-core'
import {createCollection, createLiveQueryCollection, inArray} from '@tanstack/db'
import {queryCollectionOptions, parseLoadSubsetOptions} from '@tanstack/query-db-collection'

// Documents upstream behaviour (query-db-collection 1.5.2, db 1.0.0-rc.1.5), not our code;
// draft report in r4-svelte-freshup/upstream-tanstack-report.md. Two live queries on the
// same filter, the first released while the second is still loading, leave the second
// with no rows. It is what showed 0 rows after /search/tracks?q=@slug then a tag search;
// queryView no longer opens two windows on one channel, so the app no longer meets it.
// `test.fails` passes while the bug stands: when it starts failing, upstream fixed it.
test.fails('releasing a query while another loads the same filter keeps the rows', async () => {
	const rows = Array.from({length: 140}, (_, i) => ({
		id: `t${String(i).padStart(3, '0')}`,
		slug: 'a',
		created_at: new Date(Date.UTC(2020, 0, 1, 0, 140 - i)).toISOString()
	}))
	const queryClient = new QueryClient()
	// Every subset gets its own key: where, order and window all go in
	const keyOf = (opts: Parameters<typeof parseLoadSubsetOptions>[0]) => {
		const {filters, sorts, limit} = parseLoadSubsetOptions(opts)
		return ['items', JSON.stringify({filters, sorts, limit})]
	}
	const items = createCollection(
		// eslint-disable-next-line @tanstack/query/exhaustive-deps -- the fixture rows never change
		queryCollectionOptions({
			queryClient,
			syncMode: 'on-demand',
			getKey: (row: (typeof rows)[number]) => row.id,
			queryKey: (opts) => (Object.keys(opts).length ? keyOf(opts) : ['items']),
			queryFn: async (ctx) => {
				const {limit} = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)
				await new Promise((resolve) => setTimeout(resolve, 5))
				return rows.slice(0, limit ?? rows.length)
			}
		})
	)
	// Default (locale) string order: each window also loads the whole filter, unordered
	const page = (limit: number) =>
		createLiveQueryCollection({
			query: (q) =>
				q
					.from({t: items})
					.where(({t}) => inArray(t.slug, ['a']))
					.orderBy(({t}) => t.created_at, 'desc')
					.limit(limit)
		})

	const first = page(50)
	await first.preload()
	const second = page(4000)
	const loading = second.preload()
	await first.cleanup() // e.g. the previous route unmounts during navigation
	await loading
	await new Promise((resolve) => setTimeout(resolve, 50))

	expect(second.toArray).toHaveLength(140) // actual: 0, and items.size is 0
	await second.cleanup()
})
