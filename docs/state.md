# Data and state

## Remote

Supabase PostgreSQL is the source of truth. Access via [`@radio4000/sdk`](radio4000-sdk.md) or the `r4` CLI. See [reference.json](reference.json) for all available methods.

## App state

`appState` is a Svelte-reactive global object persisted to localStorage (`app-state.svelte.ts`). Holds deck/player state, queue contents, user settings, UI preferences — anything that should survive page refresh but isn't synced to the server. See `AppState` and `Deck` types in `types.ts`.

Persistence is split into two localStorage keys: one for general state, one for queue arrays (to avoid serializing large arrays on every small change).

## Local sync and persistence

Data flows from remote to components through a caching layer:

```
Remote (Supabase) → Query Cache (IDB) → Collection (memory) → useLiveQuery → Component
```

When a component calls `useLiveQuery`, the collection checks the query cache. If data exists and is fresh (see cache config), it's used directly. If stale or missing, it fetches from remote via the collection's `queryFn()`.

Query cache is persisted to IndexedDB via `query-cache-persistence.ts`. On app boot (`+layout.js`):

1. `collectionsHydrated` — restore collection state from IDB (if enabled)
2. `cacheReady` — restore query cache from IDB
3. `preload()` — prefetch channels, restore deck tracks
4. `useLiveQuery` reads from cache, populates collections — instant UI
5. `checkTracksFreshness()` validates against remote (see `tracks.ts`) — if outdated, triggers background refetch

For the full picture on collections, queries, mutations, and live queries, see [tanstack.md](tanstack.md).

## Channels

In `+layout.js` we `preload()` all channels from remote via `prefetchQuery`. We trade a slower first-load for faster pages afterwards. This feels good now, but if we get to +4 channels let's reconsider.
