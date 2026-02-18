# Data and state

## Remote

Supabase PostgreSQL is the source of truth. Access via `@radio4000/sdk` or the `r4` CLI.

## App state

`appState` is a Svelte-reactive global object persisted to localStorage. Holds player state, queue, user settings - anything that should survive page refresh but isn't synced to the server.

## Local sync and persistence

The data flows like this:

```
useLiveQuery → Collection (memory) → Query Cache (IDB) → Remote (Supabase)
```

When a component calls `useLiveQuery`, the collection parses your query and checks the query _cache_. If data exists and is fresh (see cache config), it's used directly. If stale or missing, it fetches from remote via the collection's queryFn().

Query cache is not persisted by default, but we can persists to IndexedDB via `query-cache-persistence.ts`). On reload:

1. IDB restores query cache (e.g. `['tracks', 'starttv']`)
2. `useLiveQuery` reads from cache, populates collection — instant UI
3. `checkTracksFreshness()` validates against remote (see `tracks.ts`) — if outdated, triggers background refetch

## Channels

In +layout.js we `preload()` all channels from remote. We trade a slower first-load for faster pages afterwards. This feels good now, but if we get to +4 channels let's reconsider.
