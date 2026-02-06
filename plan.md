# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Views

- writeUpsert tag results into tracksCollection — currently tag-only queries bypass the collection and read queryClient directly (`rawData` in views page). Test: after tag fetch completes, `writeUpsert` results into `tracksCollection`, then use `tracksQuery.data` for both channel and tag paths. Removes the dual data path and the `tracksQuery.status` reactivity hack.
- Saved views — CRUD + GUI. Use `localStorageCollectionOptions` (same pattern as play-history). Collection stores `{id, name, params}` where `params` is the serialized URL string. GUI: TBD (sidebar? dropdown? page?). A saved view is just a named bookmark — the full recipe stays in the URL.
- Views as /mix input — once the view query pattern is stable, use it to power data loading on /mix. A mix crate source becomes a view. Goal: minimal glue code between the two.
- Search-only views — currently views require channels or tags (`hasFilter` guard). A search-only view would need a global fetch path (Supabase FTS) without requiring channels/tags first. Review what `fetchTracksGlobal` can already do and what's missing.

## Backlog

- use new Debounced() from runed all over the app instead of settimeout
- Seek/position deep-linking — `seekTo(seconds)` exists in api.js. For deep-linking, `?t=` alone isn't useful without specifying which track to play. Options: `?play={trackId}&t=30`, `?play={slug}&t=30`, or track page routes. Needs design decision on URL shape.
- 3D globe map view in addition to map view. Which library?
- Auto live — client-side calculation using track.duration to sync playback across listeners. When a user tunes in, calculate what track should be playing based on durations. Falls back gracefully when durations are missing. Low effort.
- Test RTL-support
- We parse track.description inside TrackCard for links with LinkEntities, consider DB trigger or something to avoid computing this over and over

## Data & migration

- Migrate v1 data to v2 — https://github.com/radio4000/migration-2026
  - How many v1 channels exist? Is migration-2026 repo active?
- v1 compatibility — v1 channels can't be followed/broadcasted due to FK constraints. Resolved by migration above. if we do migration, lots of code here regarding v1 can be deleted

## Needs research

- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.
- Local file player for mp3/m4a — changes product direction significantly.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
