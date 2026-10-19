# TanStack Query + DB

Radio4000 notes, not TanStack API docs. Load the TanStack skills first; keep this file for our boundaries, contracts, and debug routes.

## skills

Install and list them, then load the one that fits the task:

```bash
bunx @tanstack/intent@latest install
bunx @tanstack/intent@latest list
```

| task                                                           | load                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| collection setup, adapters, sync mode, preload                 | `node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md`     |
| live query builder, joins, aggregates, incremental operators   | `node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md`         |
| optimistic writes, handlers, transactions, paced mutations     | `node_modules/@tanstack/db/skills/db-core/mutations-optimistic/SKILL.md` |
| Svelte 5 `useLiveQuery`, getter deps, dot-notation reactivity  | `node_modules/@tanstack/svelte-db/skills/svelte-db/SKILL.md`             |
| SvelteKit loaders, `ssr = false`, collection preload in routes | `node_modules/@tanstack/db/skills/meta-framework/SKILL.md`               |
| unsure where the problem sits, need the broad DB model first   | `node_modules/@tanstack/db/skills/db-core/SKILL.md`                      |

If a question is mostly about TanStack itself, use those or the official docs. Add something here only after we have verified it in our code or debug routes.

## our boundary

TanStack Query caches responses. TanStack DB stores rows. In app code the boundary is `src/lib/collections/` plus `src/lib/useLiveQuery.svelte.ts`.

Always import `useLiveQuery` from `#lib/useLiveQuery.svelte`, never from `@tanstack/svelte-db`. The wrapper fixes Svelte 5 reactivity bugs (`state_unsafe_mutation`), cleans up replaced live query collections, and is the verified path for app behavior. Deps arrays are optional — Svelte 5 auto-tracks reactive reads in the callback.

## contracts we rely on

### `collection.state` is a snapshot

Treat `collection.state`, `collection.get(id)`, and `collection.toArray` as one-off reads. Fine for event handlers and debug output. Wrong source for reactive UI.

`collection.state` is a plain Map. Reading `.state`, `.state.size`, or `.state.get(id)` inside a `$derived` registers **no** Svelte dependency — the derived re-runs only when some _other_ reactive value it reads changes. A `void collection.state.size` "touch" does nothing; it reads a plain number, not a signal.

The trap: a snapshot read wrapped in a `$derived` that _also_ reads `appState.decks` (or any churning signal) _appears_ reactive, because deck churn re-runs it and it re-reads a fresh snapshot. It goes stale exactly when a row loads in (or a shown row is edited) without a concurrent churn.

Use `useLiveQuery`, then derive from `query.data`:

```js
// not reactive to collection mutations
let tracks = $derived.by(() => ids.map((id) => tracksCollection.state.get(id)).filter(Boolean))

// reactive
const query = useLiveQuery((q) => q.from({tracks: tracksCollection}).where(...))
let tracks = $derived(query.data ?? [])
```

### `queryFn` returns full truth for that fetch shape

For `queryCollectionOptions()`, the `queryFn` result is treated as complete server state for that query shape. Returning `[]` means "no rows for this query," not "leave what we already had alone."

For on-demand collections, push filtering into the live query when you can. For incremental or paginated fetches, merge rows with `utils.writeUpsert` or `writeBatch`.

### `fetchQuery` does not populate collections

`queryClient.fetchQuery()` and `prefetchQuery()` write to Query cache only. If the UI needs collection data, either let `useLiveQuery` drive the fetch, write rows in with `utils.writeUpsert`/`writeBatch`, or preload the collection in a route loader.

### mutation handlers must write server rows back

For server-backed collections like `tracks` and `channels`, `onInsert` and `onUpdate` must write the server-normalized row back into the collection. Without that `writeUpsert`, optimistic state drops before refetch lands and the UI flashes stale data. `src/lib/collections/tracks.ts` and `channels.ts` both depend on this.

### id-map lookups: trigger on a direct-collection query

Resolving specific ids (`ids.map((id) => collection.state.get(id))`) is O(1) per id. Expressing the same as a live query — `useLiveQuery((q) => q.from(...).where(inArray(id, ids)))` — builds a d2ts pipeline that rebuilds on every change; over a multi-thousand-row collection that is a ~1s main-thread block.

Why: `in` scans the whole value list per row, so `inArray` filters are O(ids × rows) — seconds of main-thread blocking at a few thousand of each. Prefer a filter over a field with few distinct values (`eq(t.slug, slug)`) — one comparison per row. Related: `collection.state` is a getter that rebuilds a snapshot Map on every access — in loops, hoist it or use `collection.get(id)`, the direct O(1) lookup.

Keep the Map lookups, but make them reactive by reading a **direct-collection** query as a trigger:

```js
const tracksLive = useLiveQuery(tracksCollection) // a collection, not a (q) => ... callback → no d2ts pipeline
let queueTracks = $derived.by(() => {
	void tracksLive.data.length // re-runs on any insert/update/delete
	const state = tracksCollection.state
	return ids.map((id) => state.get(id)).filter(Boolean)
})
```

`useLiveQuery(collection)` returns the collection bridged to Svelte via `subscribeChanges` — cheap, no pipeline. Its `data` is reassigned on every change, so reading it (even just `.length`) re-runs the derived, including on in-place edits. Used in `queue-panel.svelte`, `player.svelte` (`syncAutoTracks`), and `channel-activity.svelte.ts`.

For an app-lifetime singleton outside a component (e.g. `channel-activity.svelte.ts`), create the direct-collection queries inside `$effect.root` so their internal effects have an owner — same pattern as the persistence effects in `app-state.svelte.ts`.

## query patterns

### standard — d2ts expresses the filter

```js
const tracks = useLiveQuery((q) =>
	q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.slug, slug))
)
```

### hybrid — d2ts can't express the last filter

Live query provides the reactive source set; a local derived does the rest. Filter on `query.data`, never on `collection.state`. This covers array `includes`, overlap-style filtering, and similar.

```js
const query = useLiveQuery((q) =>
	q.from({tracks: tracksCollection}).where(({tracks}) => eq(tracks.channel_id, channelId))
)
let jazzTracks = $derived((query.data ?? []).filter((track) => track.tags?.includes('jazz')))
```

### one-off — fetch and move on

```js
const data = await queryClient.fetchQuery({
	queryKey: ['tracks', slug],
	queryFn: () => fetchTracksBySlug(slug)
})
```

For loaders, freshness checks, and other non-reactive reads.

### reactive limit (pagination)

A reactive `.limit()` drives pagination. The `queryFn` receives it via `ctx.meta?.loadSubsetOptions?.limit` and fetches that many rows; increasing it triggers a new fetch and the collection caches all rows seen. Proven in `channels.svelte` and `/docs/tanstack/channels`.

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

Caveats learned the hard way:

- `.offset()` is applied locally by d2ts, not forwarded to Supabase (the sync layer always fetches from row 0 with `limit = offset + pageSize`). Don't use it for server-side pagination.
- For paged views, accumulate `limit = currentPage * pageSize` and `.slice()` locally. The `queryFn` should delta-fetch: look up cached results for the same query shape with a smaller limit and fetch only the new rows. See `channels.ts` `queryFn`.
- Each dep change in `useLiveQuery` creates a new `createLiveQueryCollection`; our wrapper `cleanup()`s the old one to stop its d2ts pipeline and pending callbacks. Without this, stale collections cause delayed re-renders.

### keepalive pin

On-demand collections evict rows once no subscriber owns their subset — `tracks-keepalive.svelte` (with `collections/keepalive.ts`) pins a deck's queue resident; the how and why live in those files.

## debug routes

Each needs a distinct job; fold new probes into these rather than adding pages.

- `/docs/tanstack` — live app state: collection sizes, cache keys, persistence
- `/docs/tanstack/tutorial` — human walkthrough
- `/docs/tanstack/tracks`, `/docs/tanstack/channels` — probe real collections + backend wiring
- `/docs/tanstack/error-handling` — keeps the error-state rough edge visible

## what still needs proof

`collection.state` vs `useLiveQuery` reactivity is proven headlessly in `src/lib/state-reactivity.svelte.test.ts` (`useLiveQuery` updates on insert/update/delete; a `$derived` over `.state` does not, and an unrelated reactive dep masks the bug by re-running the derived).

Still only checked by hand in the browser — keep these alive with `agent-browser` (see [browser-testing.md](browser-testing.md)):

- `setQueryData` updates `createQuery` subscribers immediately
- invalidation changes stale state the way we expect
- `query.isError` / collection error state stay observable through our wrapper

## references

- https://tanstack.com/db/latest/docs/overview.md
- https://tanstack.com/db/latest/docs/guides/live-queries.md
- https://tanstack.com/db/latest/docs/guides/mutations.md
- https://tanstack.com/db/latest/docs/collections/query-collection.md
- https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient.md
