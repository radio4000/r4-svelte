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

Always import `useLiveQuery` from `#lib/useLiveQuery.svelte`, never from `@tanstack/svelte-db`. The wrapper is a near-upstream copy of the svelte-db hook that keeps rows in one `$state.raw` snapshot (so a single change doesn't re-render every row), untracks writes to avoid `state_unsafe_mutation`, uses the observer’s `wholesale` mode because it re-reads that snapshot on every change, and is the verified path for app behavior; its header lists the diffs. Deps arrays are optional — Svelte 5 auto-tracks reactive reads in the callback.

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

One named exception: `preloadChannelTracks` (`tracks.ts`, called from `[slug]/+layout.ts`) prefetches the collection's own `['tracks', slug]` key with the fetch its queryFn makes. It only warms the cache for the layout's live query; a `queryOnce` there sorted the whole channel a second time on every click (home→channel worst frame 203→267ms), so don't turn it back into a live query.

### mutation handlers must write server rows back

For server-backed collections like `tracks` and `channels`, `onInsert` and `onUpdate` must write the server-normalized row back into the collection. Without that `writeUpsert`, optimistic state drops before refetch lands and the UI flashes stale data. `src/lib/collections/tracks.ts` and `channels.ts` both depend on this.

### id-map lookups: trigger on a direct-collection query

Resolving specific ids (`ids.map((id) => collection.state.get(id))`) is O(1) per id. Expressing the same as a live query — `useLiveQuery((q) => q.from(...).where(inArray(id, ids)))` — builds a d2ts pipeline that rebuilds on every change; over a multi-thousand-row collection that is a ~1s main-thread block.

Why: `in` scans the whole value list per row, so `inArray` filters are O(ids × rows) — seconds of main-thread blocking at a few thousand of each. Prefer a filter over a field with few distinct values (`eq(t.slug, slug)`) — one comparison per row. Related: `collection.state` is a getter that rebuilds a snapshot Map on every access — in loops, hoist it or use `collection.get(id)`, the direct O(1) lookup.

Keep the Map lookups, but make them reactive with a trigger. For tracks, call `watchTracks()` (`collections/tracks.ts`):

```js
let queueTracks = $derived.by(() => {
	watchTracks() // re-runs on any insert/update/delete
	const state = tracksCollection.state
	return ids.map((id) => state.get(id)).filter(Boolean)
})
```

`watchTracks` is one `subscribeChanges` shared by every reader (Svelte's `createSubscriber`), held while any is mounted. Used in `queue-panel.svelte`, `player.svelte` (`syncAutoTracks`) and `deck-display.svelte.ts` (auto-radio coverage). A direct-collection query, `useLiveQuery(collection)`, works the same way without a pipeline, but copies every row into each reader's state on every change; don't use it on tracks or channels.

An app-lifetime singleton outside a component (`channel-activity.svelte.ts`) can subscribe with `subscribeChanges` at module level and bump a `$state` counter its `$derived` reads; a `useLiveQuery` there would need `$effect.root` to own its effects.

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
const tracks = await queryOnce((q) =>
	q.from({t: tracksCollection}).where(({t}) => eq(t.slug, slug))
)
```

For loaders and other non-reactive reads. It goes through the collection's own queryFn and key, so it shares the cache with live queries; it releases its rows when done, so hold them with a pin if something reads them later (`player/channel-tracks.ts`).

### reactive limit (pagination)

A reactive `.limit()` drives pagination. The `queryFn` receives windows via `ctx.meta?.loadSubsetOptions`; it must honor `offset` and `limit`. An absent limit means all matching rows, draining backend pages until exhausted. Proven in `channels.svelte` and `/docs/tanstack/channels`.

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

- Paged channel views accumulate `limit = currentPage * pageSize` and `.slice()` locally. DB can also request continuation windows with a nonzero offset; `channels.ts` returns exactly that window. TanStack Query caches each filter/sort/window separately.
- An unbounded request is authoritative for its whole filter. Returning a default page (formerly 20 channels) can evict rows belonging to other paged queries. Explore uses lexical ordering matching the server and a unique ID tie-breaker; the default locale string ordering can trigger unbounded requests.
- A function `queryKey` must encode exactly what its `queryFn` fetches: two subsets that share a key must get the same rows. `tracks.ts` used to drop the boundary `eq(created_at)` tie check from the key, so a 10-row window downloaded the whole channel.
- A change of only `.limit()`/`.offset()` on an ordered query moves the window of the same live query collection: it stays `ready` and asks the server for the next page only (`offset`) — if the source has an index on the order field (`autoIndex: 'eager'`, as tracks and channels do); without one DB asks for the whole prefix again, so read `collection.isLoadingSubset` / the `loadingSubset:change` event for a "loading more" state (`explore/tracks/[filter]`). Any other change builds a new live query collection; the old observer stays subscribed until its replacement is ready, then is disposed and garbage-collected after 1ms (`gcTime`). Releasing it earlier removes source rows during the replacement’s fetch and can force a full-source recovery. Unmount releases every observer.

### keepalive pin

On-demand collections evict rows once no subscriber owns their subset — `tracks-keepalive.svelte` (with `collections/keepalive.ts`) pins a deck's queue resident; the how and why live in those files.

## debug routes

Each needs a distinct job; fold new probes into these rather than adding pages.

- `/docs/tanstack` — live app state: collection sizes, cache keys, persistence
- `/docs/tanstack/tutorial` — human walkthrough
- `/docs/tanstack/tracks`, `/docs/tanstack/channels` — probe real collections + backend wiring
- `/docs/tanstack/error-handling` — keeps the error-state rough edge visible

## what still needs proof

Runes are tested in the `dom` vitest project (`*.svelte.test.ts`, happy-dom, Svelte's client build; `vite.config.ts`): `useLiveQuery.svelte.test.ts` (load more asks only for the next page) and `views.svelte.test.ts` (a tag or search view on an open channel downloads nothing). `createQuery` needs a QueryClient in component context, so mount through a host like `src/lib/test-hosts/query-view.svelte`. Everything else runs in the `node` project as before.

Still only checked by hand in the browser — keep these alive with `agent-browser` (see [browser-testing.md](browser-testing.md)):

- `setQueryData` updates `createQuery` subscribers immediately
- invalidation changes stale state the way we expect
- `query.isLoadingError` / `isSyncError` / collection error state stay observable through our wrapper

## references

- https://tanstack.com/db/latest/docs/overview.md
- https://tanstack.com/db/latest/docs/guides/live-queries.md
- https://tanstack.com/db/latest/docs/guides/mutations.md
- https://tanstack.com/db/latest/docs/collections/query-collection.md
- https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient.md
