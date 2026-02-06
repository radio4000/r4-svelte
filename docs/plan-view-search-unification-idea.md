# Unify /search and views query patterns

Goal: both `/search` and views use the same TanStack query cache for tracks.

## Current state

- **`/search`** — `searchAll()` imperative one-shot → `{channels, tracks}` in `$state` → manual `writeUpsert`
- **`/_debug/views`** — URL → reactive TanStack queries (useLiveQuery/createQuery) → tracks land in collection automatically

Two separate data paths for the same data. No cache sharing between them.

## Proposed split

**View = tracks query (shared, cached, reactive)**

Extract the three query strategies from the views page into reusable pieces:

- Channels → `useLiveQuery` with `inArray(tracks.slug, channels)`
- Tags only → `createQuery` with `.overlaps('tags', tags)`
- Search only → `createQuery` with FTS

Same cache keys, same collection writes. Search `@oskar #jazz` on `/search`, navigate to views, data's already warm.

**Channel results = /search-specific UI concern**

`findChannelBySlug` already tries `channelsCollection` first (local, cheap). Channel cards in search results are a presentation layer on top of the view — not part of the view abstraction itself. Could stay imperative or get a small `createQuery` keyed by slugs.

## Steps

1. Extract query strategies from `/_debug/views` into reusable helpers (one per strategy)
2. Views page imports and uses those helpers (no behavior change)
3. `/search` replaces `searchAll()` with the same helpers for tracks
4. `/search` keeps channel lookup as a separate concern (thin layer on top)
5. `searchAll()` can be deprecated or kept for non-reactive contexts (e.g. one-off scripts)

## Open questions

- Where do the shared helpers live? `$lib/tanstack/views.ts`? `$lib/tanstack/queries/tracks.ts`?
- Does `searchAll()` stay for non-UI callers, or do we remove it entirely?
- Should channel lookups also go through a shared query, or stay imperative (local-first, cheap)?
