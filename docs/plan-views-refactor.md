# Views refactor

## Problem

`_debug/views/+page.svelte` had a manual `fetchGlobal()` that bypassed the TanStack DB flow. It fetched from supabase, manually upserted into the collection, tracked IDs in local state (`globalTrackIds`), then `useLiveQuery` filtered by those IDs. This caused cascading reactivity (4 live query rebuilds from one sort change).

## Root cause

The tracks collection `queryFn` (tracks.ts) only handled slug-based queries. Global queries (by tags/search) had no fetch path → hence the manual `fetchGlobal` escape hatch.

## What we tried

### 1. Pure `useLiveQuery` with `.where(inArray(tracks.tags, [...]))` (blocked)

Extended `queryKey` and `queryFn` to detect tags filters via `parseLoadSubsetOptions`. The fetch works — `queryFn` sees `{field: ['tags'], operator: 'in', value: ['dub']}` and queries supabase with `.overlaps('tags', tags)`. Data arrives in the collection.

**But**: TanStack DB's in-memory `inArray` evaluator doesn't support array columns. `inArray(tracks.tags, ['dub'])` checks if the array value equals one of the literals, not whether the array _contains_ any. Confirmed by TanStack DB GitHub discussion-1022: no `arrayContains`/`arrayOverlaps` operators exist yet.

Result: queryFn fetches correct data, in-memory filter rejects everything, `tracksQuery.data` is empty.

### 2. Options considered

- **A) Hack TanStack DB** — patch the `in` evaluator in node_modules. Works but fragile.
- **B) `fetchView(view): Track[]`** — skip `useLiveQuery`, use `createQuery` from TanStack Query directly. Clean but loses collection benefits.
- **C) Wrapper: `useLiveQuery` drives fetch, read query cache for results** — chosen approach.

### 3. Current approach (C)

`useLiveQuery` with `.where(inArray(tracks.tags, view.tags))` still drives the `queryFn` (fetch works). But since the in-memory filter fails for array columns, we read results from the query cache directly for tag-only queries:

- **Channel queries**: `tracksQuery.data` (in-memory slug filter works fine)
- **Tag-only queries**: `queryClient.getQueryData(['tracks', 'tags', ...])` (bypass failed in-memory filter)
- **Channels + tags**: `tracksQuery.data` (slug filter works) + post-filter tags in JS

Reactivity: `tracksQuery.status` triggers re-derivation when the fetch completes.

Trade-off: tag-only queries don't get TanStack DB's incremental updates or optimistic rollback. Fine for this read-only browse use case.

## What's done

- Extended `queryKey` in tracks.ts to detect `tags` `in` filters → `['tracks', 'tags', ...tags.toSorted()]`
- Extended `queryFn` in tracks.ts: when tags present but no slugs → `supabase.overlaps('tags', tags).limit(200)`
- Removed `fetchGlobal`, `globalTrackIds`, `globalLoading`, the cascading `$effect` from views page
- Removed `reshuffle()` (was copy-paste of `fetchGlobal`)
- Views page uses `useLiveQuery` + `rawData` derived that reads query cache for tag-only queries
- Post-filter handles: `tagsMode=all`, search (fuzzy), shuffle, limit
- Added debug log in queryFn (remove when stable)

## Still TODO

- Test: do tag queries actually render now?
- Search: currently post-filter only (fuzzy). Could add FTS to queryFn later.
- Remove `fetchTracksGlobal` from tracks.ts if no longer used elsewhere
- Remove queryFn debug log when stable
- Update `docs/plan-views.md` data path section once settled

## Files

- `src/lib/tanstack/collections/tracks.ts` — queryKey + queryFn extended for tags
- `src/routes/_debug/views/+page.svelte` — simplified views page
- `src/lib/views.ts` — View type and URL parsing (unchanged)
