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

- [Migration Plan](./tanstack.md)
- [TanStack DB Docs](https://tanstack.com/db/latest/docs/overview)
- Current tests: `/playground/tanstack`, `/playground/tanstack-channel`

## Phase 0: App State Refactor ✅

**Solution**: Hybrid approach - `appStateCollection` as source of truth, `appState` as ergonomic reactive proxy.

**Architecture:**
- `appStateCollection` (LocalStorageCollection) = single source of truth
- `appState` ($state object) = ergonomic API, all 35 imports unchanged
- Bidirectional sync:
  - Init: collection → appState
  - Changes: appState → collection (via $effect in layout)
  - Cross-tab: collection → appState (via subscribeChanges)

**Implementation:**
- [x] Keep `appState` $state object for ergonomics
- [x] Load from collection on init
- [x] Subscribe to collection changes for cross-tab sync
- [x] Persist via existing $effect in layout.svelte
- [x] Call `initAppState()` in layout onMount

**Dev experience achieved**: `appState.volume = 0.5` works, auto-persists to localStorage, syncs across tabs. Zero changes to 35 existing imports.

## Phase 1: Collections (Foundation)

Build the core collections that replace PGlite tables.

### 1.1 App State Collection ✅

- [x] Create `appStateCollection` using LocalStorageCollection
- [x] Use existing `appStateSchema` from src/lib/schemas.ts
- [x] Replace `$lib/app-state.svelte` PGlite dependency
- [x] Test: changes persist to localStorage, sync across tabs
- [x] Refactor to use collection as single source of truth (completed in Phase 0)

**Dev experience goal**: `appState.volume = 0.5` just works, no PGlite.

### 1.2 Channels Collection ✅

- [x] Create `channelsCollection` using QueryCollection
- [x] `queryFn`: call r5.channels.r4() with r5.channels.v1() fallback
- [x] Use existing `channelSchema` from src/lib/schemas.ts
- [x] Add onUpdate/onDelete handlers (call r4 SDK)

**Dev experience goal**: One collection, handles r4→v1 fallback automatically.

**Implementation**: queryFn fetches both r4 and v1 channels, merges and deduplicates by slug (r4 takes precedence).

### 1.3 Tracks Collection ✅

- [x] Create `tracksCollection` using QueryCollection
- [x] `queryFn`: call r5.tracks.r4() with r5.tracks.v1() fallback
- [x] Use existing `trackSchema` from src/lib/schemas.ts
- [x] Add onUpdate/onDelete/onInsert handlers (call r4 SDK)
- [x] Denormalize: add `channel_slug` to track objects client-side

**Dev experience goal**: No SQL views, client-side denormalization.

**Implementation**: Collection starts empty. Use `fetchChannelTracks(slug)` helper to populate tracks for a channel - handles r4/v1 fallback based on channel source, denormalizes channel_slug, inserts into collection. Components use useLiveQuery() to filter by channel_slug.

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

- ✅ Phase 0: App State Refactor - collection as source of truth, ergonomic proxy pattern
- ✅ Phase 1.2: Channels Collection - fetches and merges r4/v1 channels
- ✅ Phase 1.3: Tracks Collection - fetchChannelTracks() helper with r4/v1 fallback and denormalization
- ✅ r5 fetch methods exist (r4/v1) without PGlite insertion
- ✅ Reactivity pattern validated in `/playground/tanstack-channel`
  - Custom events → `queryClient.invalidateQueries()` → refetch
  - See ChannelView.svelte:14-20
- ✅ App state persists to localStorage, syncs across tabs

**Next:**

- Phase 2: Route Migration (replace PGlite queries with live queries)

**Notes:**

- No sync engine (REST APIs) → QueryCollections
- localStorage persistence via query persister
- Zod schemas already exist for validation
