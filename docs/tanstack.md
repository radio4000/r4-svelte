# TanStack Query + DB

Radio4000 notes, not TanStack API docs. Load the TanStack skills first. Keep this file for our boundaries, contracts, and debug routes.

## read this first

Install and list the TanStack intent skills:

```bash
bunx @tanstack/intent@latest install
bunx @tanstack/intent@latest list
```

Useful skill files in this repo:

- `node_modules/@tanstack/db/skills/db-core/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/mutations-optimistic/SKILL.md`
- `node_modules/@tanstack/db/skills/meta-framework/SKILL.md`
- `node_modules/@tanstack/svelte-db/skills/svelte-db/SKILL.md`

If a question is mostly about TanStack itself, use those or the official docs. Add something here only after we have verified it in our code or debug routes.

## skill mappings

| task                                                           | load                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| collection setup, adapters, sync mode, preload                 | `node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md`     |
| live query builder, joins, aggregates, incremental operators   | `node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md`         |
| optimistic writes, handlers, transactions, paced mutations     | `node_modules/@tanstack/db/skills/db-core/mutations-optimistic/SKILL.md` |
| Svelte 5 `useLiveQuery`, getter deps, dot-notation reactivity  | `node_modules/@tanstack/svelte-db/skills/svelte-db/SKILL.md`             |
| SvelteKit loaders, `ssr = false`, collection preload in routes | `node_modules/@tanstack/db/skills/meta-framework/SKILL.md`               |
| unsure where the problem sits, need the broad DB model first   | `node_modules/@tanstack/db/skills/db-core/SKILL.md`                      |

## our boundary

TanStack Query caches responses. TanStack DB stores rows. In app code the boundary is `src/lib/collections/` plus `src/lib/useLiveQuery.svelte.ts`.

That wrapper is part of the contract, not a convenience import. Use it when you are proving app behavior. Import `useLiveQuery` from `@tanstack/svelte-db` only when you mean upstream semantics on purpose.

## contracts we rely on

### `collection.state` is a snapshot

Treat `collection.state`, `collection.get(id)`, and `collection.toArray` as one-off reads. Fine for event handlers and debug output. Wrong source for reactive UI.

Use `useLiveQuery`, then derive from `query.data`.

```js
// not reactive to collection mutations
let tracks = $derived.by(() => ids.map((id) => tracksCollection.state.get(id)).filter(Boolean))

// reactive
const query = useLiveQuery((q) => q.from({tracks: tracksCollection}).where(...))
let tracks = $derived(query.data ?? [])
```

### always use our `useLiveQuery` wrapper

Always import from `$lib/useLiveQuery.svelte`, never from `@tanstack/svelte-db` directly.

The wrapper fixes Svelte 5 reactivity bugs (`state_unsafe_mutation`), cleans up replaced live query collections, and is the verified path for app behavior. Deps arrays are optional — Svelte 5 auto-tracks reactive reads in the callback.

### `queryFn` returns full truth for that fetch shape

For `queryCollectionOptions()`, the `queryFn` result is treated as complete server state for that query shape. Returning `[]` means "no rows for this query," not "leave what we already had alone."

For on-demand collections, push filtering into the live query when you can. For incremental or paginated fetches, merge rows with `utils.writeUpsert` or `writeBatch`.

### `fetchQuery` does not populate collections

`queryClient.fetchQuery()` and `prefetchQuery()` write to Query cache only.

If the UI needs collection data, either:

- let `useLiveQuery` drive the fetch for an on-demand collection
- write rows into the collection with `utils.writeUpsert` or `writeBatch`
- preload the collection in a route loader

### mutation handlers must write server rows back

For server-backed collections like `tracks` and `channels`, `onInsert` and `onUpdate` must write the server-normalized row back into the collection.

Without that `writeUpsert`, optimistic state drops before refetch lands and the UI flashes stale data. `src/lib/collections/tracks.ts` and `src/lib/collections/channels.ts` both depend on this.

### hybrid queries derive from `query.data`

When d2ts cannot express the last filter, use a hybrid shape:

1. use `useLiveQuery` for the broad reactive set
2. derive the unsupported filter from `query.data`

That is how we handle array `includes`, overlap-style filtering, and similar cases. The crucial bit is where the filter runs: on `query.data`, never on `collection.state`.

## route map

Each TanStack debug route needs a distinct job.

- `src/routes/docs/tanstack/+page.svelte` shows live app state: collection sizes, cache keys, persistence.
- `src/routes/docs/tanstack/tutorial/+page.svelte` is the walkthrough for humans.
- `src/routes/docs/tanstack/tracks/+page.svelte` probes real track collection and backend wiring.
- `src/routes/docs/tanstack/channels/+page.svelte` probes real channel collection and backend wiring.
- `src/routes/docs/tanstack/error-handling/+page.svelte` keeps the error-state rough edge visible and should evolve into assertions.

Do not add more TanStack pages unless the route has a distinct verification job. Otherwise fold it into one of these.

## what still needs proof

The tutorial explains things. It does not prove much. The brittle parts need browser-visible assertions.

Keep these local checks alive:

- `useLiveQuery` updates on insert, update, and delete
- `$derived` from `collection.state` does not update on those mutations
- `setQueryData` updates `createQuery` subscribers immediately
- invalidation changes stale state the way we expect
- `query.isError` and collection error state stay observable through our wrapper or workaround path

Use [browser-testing.md](browser-testing.md) with `agent-browser` when verifying these routes.

## Radio4000 patterns

### standard

The live query fetches and reads.

```js
const tracks = useLiveQuery((q) =>
	q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.slug, slug))
)
```

Use this when d2ts can express the filter directly.

### hybrid

The live query provides the reactive source set. A local derived expression does the last unsupported filter.

```js
const query = useLiveQuery((q) =>
	q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.channel_id, channelId))
)

let jazzTracks = $derived((query.data ?? []).filter((track) => track.tags?.includes('jazz')))
```

### one-off

Just fetch and move on.

```js
const data = await queryClient.fetchQuery({
	queryKey: ['tracks', slug],
	queryFn: () => fetchTracksBySlug(slug)
})
```

Use this for loaders, freshness checks, and other non-reactive reads.

### reactive limit (pagination)

A reactive `.limit()` on the live query drives pagination. The collection's `queryFn` receives the limit via `ctx.meta?.loadSubsetOptions?.limit` and fetches that many rows from Supabase. Increasing the limit triggers a new fetch; the collection caches all rows it has seen.

```js
let paginatedLimit = $state(PAGE_SIZE)

const query = useLiveQuery((q) =>
	q
		.from({ch: channelsCollection})
		.where(({ch}) => gte(ch.track_count, 10))
		.limit(paginatedLimit)
)

function loadMore() {
	paginatedLimit += PAGE_SIZE
}

let hasMore = $derived(query.data?.length >= paginatedLimit)
```

Use this instead of manual `fetchQuery` + `writeBatch` loops. Proven in `channels.svelte` and `/docs/tanstack/channels`.

Caveats learned the hard way:

- `.offset()` on a live query is applied locally by d2ts, not forwarded to Supabase. The sync layer always fetches from row 0 with `limit = offset + pageSize`. Do not use `.offset()` for server-side pagination.
- For paged views, use `limit = currentPage * pageSize` (accumulate) and `.slice()` locally. The `queryFn` should delta-fetch: look up cached results for the same query shape with a smaller limit and only fetch the new rows. See `channels.ts` queryFn for the pattern.
- Each dep change in `useLiveQuery` creates a new `createLiveQueryCollection`. Our wrapper calls `cleanup()` on the old collection to stop its d2ts pipeline and pending callbacks. Without this, stale collections cause delayed re-renders.

## references

- https://tanstack.com/db/latest/docs/overview.md
- https://tanstack.com/db/latest/docs/guides/live-queries.md
- https://tanstack.com/db/latest/docs/guides/mutations.md
- https://tanstack.com/db/latest/docs/collections/query-collection.md
- https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient.md
