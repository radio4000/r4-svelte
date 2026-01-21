# PLAN

List of possible improvements to the architecture, idea, cli and web application.
Verify and evaluate todos before taking them on. They might be outdated or just not good ideas.

## TanStack DB upgrade cleanup

Updated to `@tanstack/db@0.5.21`, `@tanstack/query-db-collection@1.0.19`, `@tanstack/offline-transactions@1.0.11`. These fixes may allow removing workarounds:

1. **Remove custom useLiveQuery wrapper** (`src/lib/tanstack/useLiveQuery.svelte.js`): We patched `await tick()` into `subscribeChanges` to avoid `state_unsafe_mutation` during render. The `syncedData` fix in 0.5.21 may make this unnecessary. Test: swap to upstream `useLiveQuery` from `@tanstack/svelte-db`, exercise add/edit/navigate flows.

2. ~~**Remove redundant $derived wrappers around useLiveQuery**~~: Done. Simplified `src/routes/[slug]/+page.svelte` to use `tracksQuery.data` directly. Optimistic updates work, cache hydration is fast (not instant, but acceptable).

3. **Date field corruption**: ISO strings were incorrectly converted to Date objects. Fixed in offline-transactions@1.0.11. Check if we have any date-handling workarounds.

## BACKLOG

- Edit track modal is empty
- Freshness check shows `local: null` on every page load, causing unnecessary re-fetches. Likely related to disabled `collection-persistence.ts`. When re-enabling IDB persistence, ensure local timestamps are stored/retrieved.
- Our appState is serialized into localstorage on every edit to persist it. But since appState.playlist_tracks (and the shuffled) versions potentially include 3k items, it might get slow. More than this, it's just unecessary to serialize all on every change. It is however easy to reason about in the app. One appState, done. How could we improve the perf here? First thought is to split it into appState + playerState for example, if we can that way split the tracklist arrays that are only updated on channel/queue changes anyway.
- Going to homepage / and choosing "tuner" viewmode seems to start playback on a random channel byitself. It should not do that byitself..
- On-demand predicate push-down: we set `syncMode: 'on-demand'` but don't use `parseLoadSubsetOptions` in queryFn. Currently we manually check for slug and call different SDK methods. With proper on-demand, live query `where()` clauses flow through to backend:
  ```ts
  const {where} = parseLoadSubsetOptions(ctx.meta.loadSubsetOptions)
  const filters = extractSimpleComparisons(where)
  const slugFilter = filters.find((f) => f.field[0] === 'slug')
  if (slugFilter) return fetchTracksBySlug(slugFilter.value)
  ```
  Benefit: add date range or search filters in UI, they flow to SDK without touching queryFn dispatch.
- Seek/position support: add `seekTo(seconds)`, `getPosition()` via media-chrome player. Support `?t=` URL param like YouTube for deep-linking into tracks.
- add validation layer at sync boundaries (remote->local) using lib like zod 4 shared types from sdk?
- what should happen when you play a track that is not part of the current loaded playlist? Replace playlist (with what?)? Just play, ignore playlist?
- v1 compatibility: v1 channels can't be followed/broadcasted because remote supabase doesn't know about their foreign keys. V1 channels have firebase_id but don't exist in remote postgres, causing FK constraint failures. Solution ideas: use string-based IDs instead of proper foreign keys, or create placeholder records in remote for v1 channels.
- create standardized loading/error boundaries for async operations in ui
- share buttons/embeds (evaluate if needed)
- look into atproto as backend alternative to supabase. sign in with bluesky, your channel + tracks are now synced into. one way sync? probably for now unforunately. See github.com/radio4000/r4atproto
- run `bun run check` and slowly get rid of these warnings - tidy codebase
- batch-edit: URL-persist filter/search/sort state so filtered views survive refresh and can be bookmarked
- /mix state persistence: sources + options lost on navigation. Use Svelte snapshots to restore configuration when returning to page?
- /mix input UX: adding channels/tags requires type → enter → click chip. Consider debounced autocomplete with keyboard selection like /search does. Or unified input with @channel #tag syntax (already have parseMentionQuery in search.js).
- /mix tag discovery: surface (possibly shared) tags from selected source channels as suggestions.
- repost current track: shift+c shortcut (c opens modal) or subtle button after track title/desc in player. Keep it discoverable but not too prominent.
- /channels infinite mode: only uses 16 loaded channels by default. Temporarily lift limit to hundreds while infinite mode is active.

## Parked features

- direct IDB collection persistence: bypasses TanStack Query cache to avoid "cache restore overwrites optimistic updates" issue. Disabled due to performance problems. See `collection-persistence.ts` (commented out) and `docs/plan-tanstack-collection-idb-idea.md` for design.

## Performance

### track-card bottlenecks (3k+ tracks)

- extractYouTubeId per card: regex parsing runs for each track. Consider caching results or moving to track sync time. We really should set this whenever URL is updated server-side.
- LinkEntities per description: parses/transforms text for each track description. Could batch or cache.
- PopoverMenu per card: 3k popover instances in DOM even if not visible. Lazy-render only when opened? Maybe fine as is, since its native
- active state: `appState.playlist_track` check runs on all cards when current track changes. Move check to parent, only pass boolean to playing track.

## Questionable backlog

- allow users to mark a musicbrainz or discogs meta track data as wrong. Since we auto-match on the track title, there's a relatively high chance it's wrong. If it's wrong, users can delete the meta data for that track. But then it'd just match it again on reload. How do we deal with this, do we spend effort on this?
- local file player for mp3/m4a uploads
- find a way to share `track_meta` data between users. push it remote, how? security?
- consider integrating "bandsintown" as a third-party API similar to musicbrainz, youtube meta - rich data connections
