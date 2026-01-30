# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Backlog

- In-channel tag/mention filtering — clicking a tag on a channel filters that channel's tracks by tag, staying on the channel page instead of redirecting to global search. Better UX, keeps context.

- Auto live — client-side calculation using track.duration to sync playback across listeners. When a user tunes in, calculate what track should be playing based on durations. Falls back gracefully when durations are missing. Low effort.

- /channels infinite mode — update limit reactively when entering infinite mode. Currently only 16 channels loaded; set limit high when in infinite view.

- Improved fullscreen — needs design thinking. Empty player looks weird, unclear what "real" fullscreen should be. The sidebar queue is below the footer now, but this also puts it below the fullscreen footer. We want it on top of the footer, when it's fullscreen

- Option for users to backup/export their radio — use the r4 api backup endpoint, or r4 cli download?

- Seek/position support — add `seekTo(seconds)`, `getPosition()` via media-chrome player. Support `?t=` URL param for deep-linking.

- 3D globe map view in addition to map view

- batch-edit URL persistence — persist filter/search/sort state so views survive refresh. use svelte snapshot, we do this already somehwere

## Data & migration

- Migrate v1 data to v2 — https://github.com/radio4000/migration-2026
  - How many v1 channels exist? Is migration-2026 repo active?

- v1 compatibility — v1 channels can't be followed/broadcasted due to FK constraints. Resolved by migration above. if we do migration, lots of code here regarding v1 can be deleted

## Performance

- track.ytid via DB trigger — compute and store ytid when track.url is updated, instead of regex parsing per render. Quick win.

- Description link parsing is heavy — consider DB trigger for description_parsed.

- /@slug subroutes keep fetching remotely — could be cached.

- Freshness check shows `local: null` — causing unnecessary re-fetches. Related to disabled collection-persistence.ts.

- appState serialization — playlist_tracks can be 3k items, serializing on every change may be slow. Consider splitting appState + playerState.

- On-demand predicate push-down — cleaner architecture, not blocking features.

- Validation layer at sync boundaries — preventive, using zod or similar.

- Standardized loading/error boundaries — current handling may be inconsistent.

- track-card bottlenecks (3k+ tracks): extractYouTubeId per card, LinkEntities per description, PopoverMenu instances, active state checks.

## Needs research

- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto

- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.

- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.

- Local file player for mp3/m4a — changes product direction significantly.

- Share track_meta between users — collaborative metadata curation.

- Bandsintown integration — rich event data connections.
