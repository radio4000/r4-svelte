# Data and state

## Remote

Supabase PostgreSQL is the source of truth. Access via [`@radio4000/sdk`](radio4000-sdk.md) or the `r4` CLI.

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
3. `deckTracksRestored` — after first render, `loadChannelTracks()` (`player/channel-tracks.ts`) for each saved deck's channel. Nothing waits on it except the deck's queue keepalive; the current track's keepalive fetches that one row by id, so the deck shows it first. `playTrack()` waits for the channel if asked to play an id that isn't loaded yet.
4. `useLiveQuery` in routes/components fetches on demand, populating collections
5. Track subsets are trusted for 5 minutes (`staleTime` in `tracks.ts`); the next live query to open an older one shows the cached rows and refetches them in the background

For collections, queries, mutations, and live queries, see [tanstack.md](tanstack.md).

## Channels

Channels are not preloaded. `channelsCollection` is on-demand: each page's live query fetches the subset it needs, and TanStack Query caches each requested window. The adapter honors offsets and drains unbounded requests; id lookups fetch only missing rows. The featured pool (`collections/featured.ts`) is one such query, kept for an hour after its last read so channel pages opened from home find their row.

## Tracks

`tracksCollection` is on-demand too. A channel's tracks share one key, `['tracks', slug]`, whether a query asks `eq(slug)` or `inArray(slug, [slug])`, and load completely, paging past the API's 4000-row cap. `eq(id)`/`inArray(id)` fetch only missing rows; `eq(media_id)` fetches that media across channels. A limit or offset reaches the server only for newest-first queries on filters `parseTrackParams` knows; anything else fetches the whole matching set and the live query narrows it. Without a slug, a window or a date filter reads across every channel (explore's recent list); a date filter over many channels (the feed) asks 50 channels per request.
