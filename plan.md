# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Backlog

- Channel tags helper — `countStrings(tracks.flatMap(t => t.tags ?? []))` is repeated in `[slug]/+page`, `[slug]/tags/+page`, `batch-edit/`. Extract a reusable `getChannelTags(tracks)` (or similar). Once available, can be used in channel cards, list view, etc.
- Expanded list view — taller list rows showing channel tags + latest 3-5 tracks. Not a new view mode; could be the list view itself when there's enough space (responsive), or a toggle within list view. Depends on channel tags helper above.
- Seek/position deep-linking — `seekTo(seconds)` exists in api.js. For deep-linking, `?t=` alone isn't useful without specifying which track to play. Options: `?play={trackId}&t=30`, `?play={slug}&t=30`, or track page routes. Needs design decision on URL shape.
- 3D globe map view in addition to map view. Which library?
- Auto live — client-side calculation using track.duration to sync playback across listeners. When a user tunes in, calculate what track should be playing based on durations. Falls back gracefully when durations are missing. Low effort.
- Test RTL-support
- We parse track.description inside TrackCard for links with LinkEntities, consider DB trigger or something to avoid computing this over and over
- Views: Saved views — CRUD + GUI. Use `localStorageCollectionOptions` (same pattern as play-history). Collection stores `{id, name, params}` where `params` is the serialized URL string. GUI: TBD (sidebar? dropdown? page?). A saved view is just a named bookmark — the full recipe stays in the URL.
- Views: as /mix input — mix crate sources become Views. Tags would query Supabase (real global results instead of local-only filtering). `processViewTracks` handles shared post-processing; query orchestration can be inlined or extracted into a `useViewTracks` composable if both pages need the same 3-query pattern. Crate UI (pills, suggestions, avatars) stays separate from the plumbing.
- Views: channel page (`/@slug`) — could use `processViewTracks` for its inline fuzzy+tag filter. Works fine now, low priority.

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
