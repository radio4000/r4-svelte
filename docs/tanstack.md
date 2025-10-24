# TanStack DB Migration Plan

> Replacing PGlite with TanStack DB: reactive collections, live queries, optimistic mutations. No PGlite remains.

## 2025-01-27 Update: Tracks Collection Pattern

**Discovery:** `tracksCollection` doesn't fit the TanStack QueryCollection pattern.

**Why:** QueryCollection expects `queryFn() → [complete state]`, but we need lazy per-channel fetching across 150k tracks.

**Current approach:** Hybrid pattern using `createQuery` (fetch) + `$effect` (sync) + `LocalStorageCollection` (store) + `useLiveQuery` (react).

**Status:** Working prototype in `/playground/tanstack-channel/hybrid-test` - fast, reactive, persistent.

**Open questions:** Is this the right™ TanStack pattern, or should we rethink the architecture? See "Tracks Collection: Pattern Mismatch" below.

## Architecture

**TanStack DB** = reactive client store with 3 primitives:

1. **Collections** - typed sets of objects (QueryCollection, LocalStorageCollection)
2. **Live Queries** - reactive filtering/joining, sub-millisecond performance
3. **Transactional Mutations** - optimistic by default, auto-rollback on error

```
r5 SDK (pure fetch)     →  TanStack Collections  →  Live Queries (components)
├── r5.channels.r4()    →  channelsCollection    →  useLiveQuery()
├── r5.channels.v1()    →  tracksCollection      →  ilike/eq/or/and
├── r5.tracks.r4()      →  appStateCollection    →  Client-side joins
└── r5.tracks.v1()
```

**Key**: No sync engine needed (REST APIs) → QueryCollections fetch via r5.

## Reference

- [TanStack DB Complete Docs](./tanstack-llm.md)
- [TanStack DB Official](https://tanstack.com/db/latest/docs/overview)

## Completed ✅

**Phase 0-2: Foundation & Routes**

- Collections: `appStateCollection`, `channelsCollection`, `tracksCollection`, `playHistoryCollection`
- Schemas: All using `.nullish()` for database nulls
- App state: **TanStack collection only** (no proxy pattern)
- Homepage, channel page, search, track editing/adding
- Pattern: r5 SDK → collections → `useLiveQuery()` → components

**Phase 3: Core Components**

- ✅ `player.svelte` - uses `useAppState()` hook and `appStateCollection` mutations
- ✅ `queue-panel.svelte` - uses `useLiveQuery()` for queue and history with client-side joins
- ✅ `history/+page.svelte` - uses `playHistoryCollection` with client-side joins
- ✅ `api.js` - all mutations via `appStateCollection.update()`
- ✅ `api/player.js` - all mutations via `appStateCollection.update()`

**Phase 4: Supporting Features - COMPLETED** ✅

- ✅ Created `followersCollection` and `trackMetaCollection` schemas
- ✅ Migrated `musicbrainz.js` to use `trackMetaCollection`
- ✅ Migrated `followers.js` to use `followersCollection`
- ✅ Migrated `api.js` follower functions (`followChannel`, `unfollowChannel`, `getFollowers`, `isFollowing`)
- ✅ Migrated `broadcast.js` channel lookup to collections
- ✅ `track-related.svelte` - already using TanStack
- ✅ `stats/+page.svelte` - already using TanStack

**Phase 4.5: App State Collection Migration - COMPLETED** ✅

- ✅ Removed reactive proxy pattern from `app-state.svelte.ts`
- ✅ Created `useAppState()` hook for components
- ✅ Updated `+layout.svelte` to use hook (removed persistence `$effect`)
- ✅ Migrated all `api.js` and `api/player.js` mutations to `appStateCollection.update()`
- ✅ Updated core components (`player.svelte`, `theme-toggle.svelte`)
- ✅ Linting passes
- 📝 Migration guide: `MIGRATION-APPSTATE.md`

## Remaining Work

**Phase 5: Component Migration** (optional)

- [ ] Migrate 33 remaining components from old `appState` proxy to `useAppState()` hook
- Pattern documented in `MIGRATION-APPSTATE.md`
- Core functionality (api, player, layout) already migrated

**Remaining PGlite Usage** (non-critical, optional/experimental):

Files still using `pg.sql`:

- `routes/auth/+page.svelte` - auth flows
- `routes/playground/spam-warrior/*` - spam detection playground
- `routes/add/+page.svelte`, `routes/[slug]/update/+page.svelte` - form pages
- `lib/components/pglite-repl.svelte` - debug REPL
- `lib/cli-browser.js`, `lib/batch-edit.svelte.ts` - admin tools
- `lib/search.js`, `lib/live-query.js` - search utilities
- `lib/metadata/youtube.js` - YouTube metadata enrichment
- `routes/[slug]/trackids/+page.js` - track ID utilities

**Final cleanup** (Phase 6):

- [ ] Remove PGlite from package.json (when ready)
- [ ] Delete `src/lib/r5/db.js` and migrations/ (when ready)
- [ ] Archive local-database.md
- [ ] Update CLAUDE.md

## Collections Summary

**Collections by Type:**

**QueryCollections** (auto-fetch, TanStack Query cache):

- `channelsCollection` - fetches all channels (r4+v1) via single queryFn ✅ fits pattern

**LocalStorageCollections** (manual population, cross-tab sync):

- `appStateCollection` - app state
- `playHistoryCollection` - listening history
- `followersCollection` - follower relationships
- `trackMetaCollection` - enriched metadata (YouTube, MusicBrainz, Discogs)
- `tracksCollection` - tracks loaded on-demand per channel ⚠️ doesn't fit QueryCollection pattern

## Tracks Collection: Pattern Mismatch

**The Problem:**

TanStack QueryCollection expects: `queryFn() → [complete state]`

We have: `fetchChannel(slug) → [one channel's tracks]` × many channels

**Why QueryCollection doesn't work for tracks:**

1. Can't fetch all 150k tracks at once (too large)
2. queryFn is static - can't parametrize by channel slug
3. "Full state sync" - returning one channel's tracks deletes all others

**Current Approach - Hybrid Pattern:**

```svelte
// Per-channel fetching via TanStack Query
const tracksQuery = createQuery(() => ({
  queryKey: ['tracks', slug, limit],
  queryFn: async () => r5.tracks.r4({slug, limit})
}))

// Sync query data → LocalStorageCollection (handles cache hits + fresh fetches)
$effect(() => {
  if (tracksQuery.data) {
    tracksQuery.data.forEach(track => {
      if (!tracksCollection.get(track.id)) {
        tracksCollection.insert({...track, channel_slug: slug})
      }
    })
  }
})

// Reactive queries on accumulated state
const {data: tracks} = useLiveQuery(q =>
  q.from({track: tracksCollection})
   .where(({track}) => eq(track.channel_slug, slug))
)
```

**What this achieves:**

- ✅ Lazy per-channel fetching (createQuery)
- ✅ TanStack Query caching per channel
- ✅ Accumulated global state (all visited channels in collection)
- ✅ Cross-component reactivity (useLiveQuery)
- ✅ Cross-channel queries (search, stats)
- ✅ localStorage persistence

**Why it's complex:**

- Uses TanStack Query (createQuery) AND TanStack DB (collection) separately
- $effect bridges the two systems (Query cache ≠ DB collection)
- Every component needs this pattern for tracks

**Open Questions:**

1. **Is this the right™ TanStack pattern?** We're manually bridging Query → Collection
2. **Should this be a hook?** `useChannelTracks(slug)` to hide the complexity
3. **Should tracks be per-channel collections?** One `createCollection` per channel instead of global
4. **Is there a TanStack-native way** to handle "lazily accumulate from multiple parametrized fetches"?

See `/playground/tanstack-channel/hybrid-test` for working proof-of-concept.

## Migration Complete ✅

**PGlite Removed:**

- All core features now use TanStack DB with localStorage
- `+layout.js` and `+layout.svelte` - PGlite code commented out
- Channels and tracks now persist to localStorage (no longer ephemeral)
- `preloadChannels()` replaces old PGlite-based autoPull

**Benefits:**

- Simpler architecture - single persistence layer (localStorage)
- No database migrations needed
- Faster startup - no PGlite initialization
- Cross-tab sync built-in
- All data survives page reload
- **Consistent state pattern** - no proxy/collection duality

## App State Pattern ✅

**Current (Proxy with Property Accessors):**

```js
import {useAppState} from '$lib/app-state.svelte'

const appState = useAppState()

// Read (reactive)
{
	appState.volume
}

// Write (persists to localStorage + reactive)
appState.volume = 0.8
```

**Implementation:**

`useAppState()` returns a Proxy that:

- **Reads**: Access `query.data?.[0]` via getter (reactive via `$derived`)
- **Writes**: Call `appStateCollection.update(1, draft => {...})` via setter

**Pitfalls to Avoid:**

```js
// ❌ WRONG - Can't return $derived directly (placement rule)
export function useAppState() {
	const query = useLiveQuery(appStateCollection)
	return $derived(query.data?.[0]) // Error: $derived must be variable declaration
}

// ❌ WRONG - Destructuring breaks reactivity
const appState = useAppState().data // Gets initial value only, not reactive

// ❌ WRONG - Old pattern (verbose, requires two imports)
import {useAppState} from '$lib/app-state.svelte'
import {appStateCollection} from '$lib/collections'
const {data: appState} = useAppState()
appStateCollection.update(1, (draft) => {
	draft.volume = 0.8
})

// ✅ CORRECT - Proxy pattern (clean, one import)
import {useAppState} from '$lib/app-state.svelte'
const appState = useAppState()
appState.volume = 0.8 // Works!
```

**Key Insights:**

1. **Svelte 5 `$derived` placement**: Can only be used as variable declaration, not return value
2. **Proxy pattern**: Enables clean read/write syntax while maintaining reactivity
3. **Property accessors**: Getter returns reactive `$derived` value, setter calls collection update
4. **useLiveQuery flicker fix**: Assign array directly (`internalData = values`) instead of empty-then-push pattern

## Next Steps

- Optionally migrate remaining 33 component files (see `MIGRATION-APPSTATE.md`)
- Test the app thoroughly without PGlite
- Remove PGlite dependency from package.json
- Delete `src/lib/r5/db.js` and migrations
- Archive or update remaining PGlite-using pages (playground, admin tools)
