# PLAN

Possible improvements. Roughly by priority. Verify before implementing.

## Backlog

- Verify track deletion end-to-end — TanStack collection, reactivity, optimistic mutations, SDK return values.
- Track related page may be broken. "clio - faces" (https://beta.radio4000.com/good-time-radio/tracks/175ed76b-a97d-44c8-a56c-12968f2b19f0/related) exists multiple times on r4 but related shows "no related information". Check with `r4` CLI against `media_id`.
- Consolidate `channels.svelte` and `channels-view.svelte` — ~95 lines duplicated (view rendering, display mode switcher, canvas state, layout CSS). `channels-view.svelte` is the right abstraction but `channels.svelte` re-implements all display logic instead of delegating. After: data fetching/filtering/pagination stay in `channels.svelte`, rendering lives in `<ChannelsView>` (needs `tuner` mode, `skipSort` for pre-sorted data, snippet slots for header/footer). Followers/following pages unchanged.
- Hashtag parsing: should `"#one#two"` be one tag or two? Decide, update LinkEntities test and regexes. Parsing happens in Postgres, not the app — tests should use the same regexes, not define new ones.
- `nav.tabs` vs `div.track-tabs>nav` — clean up markup
- Track meta introduces a `.tags` style — reuse or unify with existing?
- Track meta pages: json/raw toggle sits below output, jumps when tapped. Move it above.
- Why does `<TrackList>` have both `tracks` and `playlistTracks` props?
- Switching discogs/musicbrainz tabs blocks the browser ~12s (`/oskar/tracks/639c8d7a-e095-49b9-b0a0-cdfdf2dd8af8/discogs`). Needs profiling.
- Batch edit: remove tap-to-select on rows. The checkbox is enough.
- 3D globe map view alongside flat map. Try OGL instead of Three.js. Someday/maybe.
- Test RTL support
- `TrackCard` parses `track.description` with LinkEntities on every render. Consider a DB trigger or cache.
- OpenGraph `<meta>` tags on channel/track pages for social sharing previews. Load functions already fetch the data server-side.
- Media Session API — lock screen and notification controls (play/pause/skip/artwork). Player has all the hooks, wire up `navigator.mediaSession`.
- Channel page (`/@slug`) could use `processViewTracks` for its inline fuzzy+tag filter. Works fine now, low priority.
- Duplicate track detection — warn when adding a URL that already exists in the channel. Could also surface in batch-edit (group by URL or `media_id`).
- Musicbrainz/discogs auto-matching has a high error rate. Let users mark metadata as wrong, or show an "unverified" badge.
- Local file player for mp3/m4a
- `discogs-core.js:6–8` — in-memory fetch cache grows unbounded. 5-min TTL but no eviction. Long sessions accumulate entries. Could move to a db collection.

## Performance

Mutating `$state` arrays item-by-item (push-in-loop) instead of replacing them causes heavy proxy overhead. The `syncDataFromCollection` fix (assign `[...values()]`) cut ~140ms blocking per query on large collections. Same pattern likely exists elsewhere.

Known hotspots:

- `.push()` loops into `$state([])` variables — replace with single assignment
- `player.svelte` uses `useLiveQuery` on `channelsCollection` (~350ms per deck) for a single-channel lookup that could be `collection.get(id)`
- `queue-panel.svelte` has two `useLiveQuery` calls (tracks by IDs + play history). The history query scans all of `playHistoryCollection` every time
- Live query accumulation — navigating creates new queries without cleaning up old ones. Unclear if disposed queries are GC'd or leak

## Data

- **Play history threshold** — a track is recorded the moment it starts playing. Should count only after enough listening: full track if under 2 min, half the duration (max 4 min) otherwise. Open questions: accumulate actual play time vs. furthest position? What about pause/resume? Should skipped tracks get a `skipped` flag or disappear? Currently `addPlayHistoryEntry` fires in `playTrack()` (api.ts); would move to `player.svelte` using `timeupdate`. Needs `getPlayCountThreshold(durationSec)` helper and a way to pass `reason_start` to the player.

## Code cleanup

### Player & audio edge cases

- `seekWhenReady` race in `broadcast.js` — between the final `seekJobSeqByDeck` check and `play(deckId)`, a new job could start. Old job's `play()` still fires.
- `userHasPlayed` not reset between playlists (`player.svelte`) — flag carries over when switching channels, may cause unexpected autoplay.
- Ephemeral broadcast tracks have `slug: null` (`broadcast.js`) — listeners can't look up non-DB tracks without `track_url`.
- `applyBroadcastState` rebuilds `managedIds` inside loop — O(n²) for deck count. Fine now, may matter later.

### Duplicated code

- **Metadata upsert × 3** — `metadata/youtube.js`, `metadata/musicbrainz.js`, `metadata/discogs.js` repeat get-or-insert + update on `trackMetaCollection`. Extract `upsertTrackMeta(mediaId, field, data)`. TanStack db collections may already have `writeUpsert`.
- **`sortByNewest`** only sorts by `created_at`. Multiple places sort by `started_at`, `updated_at`. Accept a field parameter or extract `sortByDate(field, dir)`.

### Accessibility

- Click handlers on non-interactive elements need `<button>` or `role="button"` + `tabindex="0"` + keyboard handler: `player.svelte` (header, footer), `cover-flip.svelte`, `track-card.svelte`, `r4-discogs-resource.svelte`, `draggable-panel.svelte`.
- `channel-card.svelte` — `tabindex="0"` on `<article>` without `role` or `aria-label`. The svelte-ignore comment suppresses the warning rather than fixing it.

## Needs research

- **`useLiveQuery` migration** — two versions in use: official `@tanstack/svelte-db` (14 files) and custom `$lib/tanstack/useLiveQuery.svelte` (11 files). The official version fires `$state` mutations during `$derived` evaluation when IDB-cached data loads (`state_unsafe_mutation`). Custom version avoids this with `includeInitialState: false` + `untrack()`. Root layout already swapped. ~15 files remain: `layout-header`, `player`, `button-follow`, `queue-panel`, `history/+page`, `broadcasts/+page`, `[slug]/edit`, `auth/+page`, `[slug]/map`, `[slug]/batch-edit`, `[slug]/trackids`, `[slug]/delete`, `[slug]/tracks/[tid]/(tabs)/+layout`, plus debug pages. Need a way to switch globally + per page.
- **atproto scrobbling** — on play, write `fm.teal.alpha.feed.play` to the user's PDS via teal.fm's lexicon. Shared listening history across apps. Requires OAuth account linking, opt-in, one `createRecord` per play. Fire-and-forget, no sync. Proves out atproto OAuth plumbing for everything else.
- **atproto as backend** — sign in with Bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- **Shared track_meta** — collaborative metadata curation between users. See github.com/radio4000/r4-sync-tests/issues/6
