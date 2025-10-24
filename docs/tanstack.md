# TanStack DB Migration Plan

> Replacing PGlite with TanStack DB for ultimate dev experience: reactive collections, live queries, optimistic mutations.

## Mental Model

**TanStack DB** = reactive client store extending TanStack Query with 3 primitives:
1. **Collections** - typed sets of objects (QueryCollection, LocalStorageCollection)
2. **Live Queries** - reactive filtering/joining with sub-millisecond performance
3. **Transactional Mutations** - optimistic by default, auto-rollback on error

**Our Architecture:**
```
r5 (pure fetch)         →  TanStack Collections  →  Live Queries (in components)
├── r5.channels.r4()    →  channelsCollection    →  useLiveQuery()
├── r5.channels.v1()    →  tracksCollection      →  SQL-like API
├── r5.tracks.r4()      →  appStateCollection    →  Client-side joins
└── r5.tracks.v1()
```

**Key insight**: No sync engine (we have REST APIs) → use QueryCollections that fetch via r5 methods.

## Reference

- [TanStack DB Docs](https://tanstack.com/db/latest/docs/overview)
- [Interactive Guide](https://frontendatscale.com/blog/tanstack-db/)
- Current tests: `/playground/tanstack`, `/playground/tanstack-channel`

## Phase 1: Collections (Foundation)

Build the core collections that replace PGlite tables.

### 1.1 App State Collection
- [ ] Create `appStateCollection` using LocalStorageCollection
- [ ] Use existing `appStateSchema` from src/lib/schemas.ts
- [ ] Replace `$lib/app-state.svelte` PGlite dependency
- [ ] Test: changes persist to localStorage, sync across tabs

**Dev experience goal**: `appState.volume = 0.5` just works, no PGlite.

### 1.2 Channels Collection
- [ ] Create `channelsCollection` using QueryCollection
- [ ] `queryFn`: call r5.channels.r4() with r5.channels.v1() fallback
- [ ] Use existing `channelSchema` from src/lib/schemas.ts
- [ ] Add onUpdate/onDelete handlers (call r4 SDK)

**Dev experience goal**: One collection, handles r4→v1 fallback automatically.

### 1.3 Tracks Collection
- [ ] Create `tracksCollection` using QueryCollection
- [ ] `queryFn`: call r5.tracks.r4() with r5.tracks.v1() fallback
- [ ] Use existing `trackSchema` from src/lib/schemas.ts
- [ ] Add onUpdate/onDelete handlers (call r4 SDK)
- [ ] Denormalize: add `channel_slug` to track objects client-side

**Dev experience goal**: No SQL views, client-side denormalization.

**Location**: Create new file `src/lib/collections.ts` for all collections.

## Phase 2: Route Migration

Replace PGlite queries with live queries.

### 2.1 Homepage (src/routes/+page.svelte)
- [ ] Remove direct PGlite `pg.query('SELECT * FROM channels ...')`
- [ ] Use `useLiveQuery()` to read from `channelsCollection`
- [ ] Remove `r5.channels.pull()` in pullRadios button
- [ ] Add mutation to refresh channelsCollection

**Dev experience goal**: No manual SQL, reactive channel list.

### 2.2 Channel Page (src/routes/[slug]/+page.js, +page.svelte)
- [ ] Remove `r5.channels.pull()` from load function
- [ ] Remove `r5.tracks.pull()/local()` from $effect
- [ ] Use `useLiveQuery()` with `.where()` to filter by slug
- [ ] Remove `r5.channels.outdated()` background refresh
- [ ] Configure collection `staleTime` for auto-refresh

**Dev experience goal**: Load function simplified, TanStack handles staleness.

### 2.3 Track Editing (src/lib/components/edit-track-modal.svelte)
- [ ] Replace custom event invalidation with transactional mutation
- [ ] Use `tracksCollection.update()` for optimistic updates
- [ ] Auto-rollback on error, no manual cache invalidation

**Dev experience goal**: Optimistic by default, less boilerplate.

## Phase 3: Advanced Features

Leverage live queries for complex use cases.

### 3.1 Client-Side Joins
- [ ] Explore: live query joining tracks + channels
- [ ] Replace SQL `tracks_with_meta` view patterns
- [ ] Test: performance with 1000+ tracks

**Dev experience goal**: SQL-like joins client-side, sub-millisecond.

### 3.2 Derived State
- [ ] Example: favorite channels with uncompleted tracks
- [ ] Example: tracks grouped by tags
- [ ] Use `.where()`, `.join()`, chained live queries

**Dev experience goal**: Complex filtering without new endpoints.

## Phase 4: Polish & Validation

### 4.1 Offline Support
- [ ] Load channel + tracks
- [ ] Disconnect network
- [ ] Verify cached data works
- [ ] Reconnect, verify refetch

### 4.2 Performance
- [ ] Test mobile Firefox with 1000+ tracks
- [ ] Compare render/scroll vs PGlite baseline
- [ ] Profile re-renders with React DevTools (or equivalent)

### 4.3 Cleanup
- [ ] Remove PGlite dependencies from package.json
- [ ] Remove src/lib/r5/db.js
- [ ] Remove src/lib/migrations/
- [ ] Archive docs/local-database.md

## Current Status

**Completed:**
- ✅ r5 fetch methods exist (r4/v1) without PGlite insertion
- ✅ Reactivity pattern validated in `/playground/tanstack-channel`
  - Custom events → `queryClient.invalidateQueries()` → refetch
  - See ChannelView.svelte:14-20

**In Progress:**
- 🚧 Phase 1: Collections (not started)

**Notes:**
- No sync engine (REST APIs) → QueryCollections
- localStorage persistence via query persister
- Zod schemas already exist for validation
