# Data and state

## Remote

Supabase PostgreSQL is the source of truth. Access via [`@radio4000/sdk`](radio4000-sdk.md) or the `r4` CLI. See [reference.json](reference.json) for all methods.

## App state

`appState` is a Svelte-reactive global persisted to localStorage (`app-state.svelte.ts`). Holds deck/player state, queue contents, user settings, UI preferences — anything that should survive a refresh but isn't synced to the server. See `AppState` and `Deck` in `types.ts`.

Persistence uses two localStorage keys: one for general state, one for queue arrays (so large arrays aren't reserialized on every small change). Transient deck runtime fields are excluded and reset on reload: media progress (`media_current_time`, `media_duration`), live/broadcast listening flags, drift flags, play/seek timestamps.

## Local sync and caching

Data flows from remote to components through a caching layer:

```
Remote (Supabase) → Query Cache (memory) → Collection (memory) → useLiveQuery → Component
```

`useLiveQuery` checks the collection; fresh cached data is used directly, stale or missing data is fetched via the collection's `queryFn()`. Sync is on-demand — live queries drive all fetching; nothing is prefetched.

IndexedDB persistence is currently **disabled**: `collection-persistence.ts` (`collectionsHydrated`) and `query-cache-persistence.ts` (`cacheReady`) export resolved stubs while data-flow bugs are debugged. The persister code is kept for re-enabling. Until then the cache is memory-only and every session starts cold.

On app boot (`+layout.js`):

1. `collectionsHydrated` / `cacheReady` — currently no-ops (see above)
2. `preload()` — seed channels (embed/local modes), validate broadcast listening state, expose `window.r5` debug handles. The app renders once this resolves.
3. `deckTracksRestored` — after first render, `ensureTracksLoaded()` for each saved deck's channel. Nothing waits on it except the deck's queue keepalive; the current track's keepalive fetches that one row by id, so the deck shows it first. `playTrack()` waits for the channel if asked to play an id that isn't loaded yet.
4. `useLiveQuery` in routes/components fetches on demand, populating collections
5. `checkTracksFreshness()` validates per-channel tracks against remote (see `tracks.ts`); refetches in the background if outdated

For collections, queries, mutations, and live queries, see [tanstack.md](tanstack.md).

## Channels

Channels are not preloaded. `channelsCollection` is on-demand: each page's live query fetches the subset it needs, and the `queryFn` serves repeats from cache, delta-fetching only missing rows for pagination and id lookups.
