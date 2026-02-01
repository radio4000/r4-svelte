# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Backlog

- In-channel tag/mention filtering — clicking a tag on a channel filters that channel's tracks by tag, staying on the channel page instead of redirecting to global search. Better UX, keeps context.
- Option for users to backup/export their radio — use `api.radio4000.com/api/v2/backup?slug={slug}`. Add UI button on channel settings or similar.
- Seek/position deep-linking — `seekTo(seconds)` exists in api.js. For deep-linking, `?t=` alone isn't useful without specifying which track to play. Options: `?play={trackId}&t=30`, `?play={slug}&t=30`, or track page routes. Needs design decision on URL shape.
- batch-edit URL persistence — persist filter/search/sort state so views survive refresh. Use svelte snapshot like `/src/routes/mix/+page.svelte` does.
- 3D globe map view in addition to map view. Which library?
- Auto live — client-side calculation using track.duration to sync playback across listeners. When a user tunes in, calculate what track should be playing based on durations. Falls back gracefully when durations are missing. Low effort.

## Data & migration

- Migrate v1 data to v2 — https://github.com/radio4000/migration-2026
  - How many v1 channels exist? Is migration-2026 repo active?

- v1 compatibility — v1 channels can't be followed/broadcasted due to FK constraints. Resolved by migration above. if we do migration, lots of code here regarding v1 can be deleted

## Performance

- track-card bottlenecks: LinkEntities parsing, PopoverMenu instances, active state checks
- Description link parsing is heavy — consider DB trigger for description_parsed.
- appState serialization — playlist_tracks can be 3k items, serializing on every change may be slow. Consider splitting appState + playerState.
- Validation layer at sync boundaries — preventive, using zod or similar.
- Grouped tracklist overhead — date parsing per track, section header creation. Virtualization disabled due to rendering issues with grouping. Check it out. It can probably be faster somewhere

## Needs research

- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.
- Local file player for mp3/m4a — changes product direction significantly.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
