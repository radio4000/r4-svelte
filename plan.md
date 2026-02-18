# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Performance audit — $state proxy & useLiveQuery hotspots

The `syncDataFromCollection` fix (assign `[...values()]` instead of reset-then-push) eliminated ~140ms of blocking per query for large collections. The pattern — mutating a `$state` array item-by-item instead of replacing it — likely exists elsewhere. An agent should:

1. **Grep for `.push(` on `$state` arrays** — any loop or spread-push into a `$state([])` variable is a candidate. Replace with single assignment.
2. **Grep for `useLiveQuery` call sites** — each creates a `createLiveQueryCollection`. Check if the caller actually needs a live query or could use an existing reactive context/parent query instead (like the `[slug]` layout channel fix — root layout already had channels via context).
3. **Check `player.svelte`** — has a `useLiveQuery` on `channelsCollection` (~350ms creation per deck). Could use channels context instead, same pattern as the `[slug]` layout fix.
4. **Check `queue-panel.svelte`** — has 2 `useLiveQuery` calls (tracks by IDs, play history). The history one scans the full `playHistoryCollection` every time.
5. **Profile `@tanstack/svelte-db` `useLiveQuery`** — the root layout uses the official version (not our debug copy). Verify it doesn't have the same reset-then-push pattern.
6. **Count live query accumulation** — navigating back and forth creates new queries without cleaning up old ones (IDs keep incrementing). Check if disposed queries are GC'd or leak.

## Backlog

- Expanded list view — taller list rows showing channel tags + latest 3-5 tracks. Not a new view mode; the list view itself expands when there's enough space using container queries (no toggle). Can use `getChannelTags()` from utils.
- 3D globe map view in addition to map view. Use Three.js (already a dependency). Someday/maybe.
- Auto live — client-side calculation using track.duration to sync playback across listeners. When a user tunes in, calculate what track should be playing based on durations. Falls back gracefully when durations are missing. TBD: for tracks missing duration, could fetch via `media-now getMedia()` on demand. Low effort.
- Test RTL-support
- We parse track.description inside TrackCard for links with LinkEntities, consider DB trigger or something to avoid computing this over and over
- Views: Saved views — CRUD + GUI. Use `localStorageCollectionOptions` (same pattern as play-history). Collection stores `{id, name, params}` where `params` is the serialized URL string. GUI: TBD (sidebar? dropdown? page?). A saved view is just a named bookmark — the full recipe stays in the URL.
  Views: as /mix input — mix crate sources become Views. Tags would query Supabase (real global results instead of local-only filtering). Crate UI (pills, suggestions, avatars) stays separate from the plumbing.
- OpenGraph share previews — proper `<meta>` tags on channel/track pages so links preview nicely in social/chat apps. Needs server-side data (load functions already fetch channel/track).
- Media Session API — OS-level lock screen / notification controls (play/pause/skip/artwork). Player already has all the hooks; wire up `navigator.mediaSession.metadata` and action handlers.
- Views: channel page (`/@slug`) — could use `processViewTracks` for its inline fuzzy+tag filter. Works fine now, low priority.
- Duplicate track detection — warn when adding a track URL that already exists in the channel. Could also surface duplicates in batch-edit (group by URL or media_id).
- Expand our broadcast schema with a custom JSON field (?) so we can push arbitrary data without updating the schema every time. We could, for example, put the player data of each deck from /mix

## Data & migration

- Play history threshold — currently a track is recorded to play history as soon as it starts playing. Instead, a play should count only after the user has listened long enough: the entire track if under 2 min, or half the duration (max 4 min), whichever is longest. Open questions: what happens when the user seeks/skips around within a track (accumulate actual play time vs. furthest position reached?), what about pausing and resuming, and should skipped tracks still appear in history with a `skipped` flag or not at all? Currently `addPlayHistoryEntry` fires in `playTrack()` (api.ts); would move to player.svelte using `timeupdate` events. Needs `getPlayCountThreshold(durationSec)` helper in play-history.ts and a way to pass `reason_start` to the player (e.g. via appState).

## In progress

- YouTube music credits in media-now — extract structured song/artist/album from YouTube watch pages.
  - **Research done**: YouTube embeds music metadata in `ytInitialData` → `horizontalCardListRenderer` (header "Music") → `videoAttributeViewModel`. A secondary `confirmDialogEndpoint` ("Song credits" dialog) has the same data plus optional `Writers`. No API key needed, single fetch to the watch page.
  - **Coverage**: 31/50 ko002 tracks had a music card, 14/50 had credits dialog. User uploads with no Content ID match return nothing.
  - **Fields available**: `song`, `artist`, `album`, `albumArt`, `writers?` — no year/duration from the card itself.
  - **Next steps**:
    1. Add `fetchCredits(id): Promise<MusicCredits | null>` to `media-now/src/providers/youtube.ts` (alongside existing `fetch` and `search`)
    2. Add `MusicCredits` type to `media-now/src/types.ts`
    3. Export from provider only (not top-level) — usage: `import { youtube } from 'media-now/providers/youtube'`
    4. Tests against known video IDs (Topic, official, user upload)
    5. Use in r4-sync-tests: enrich tracks with clean artist/song/album for MusicBrainz/Discogs lookup
  - **Status**: Implementation in progress on a branch in media-now. Can test integration in r4-sync-tests once merged.
  - **Probe scripts**: `yt-dump-50.ts`, `yt-probe-cards.ts`, `yt-probe-credits-raw.ts` — results in `yt-dump-50.json`, `yt-credits-raw.json`

## Needs research

- `state_unsafe_mutation` with IDB cache — TanStack DB's `subscribeChanges` callbacks can fire during Svelte's `$derived` computation when the internal graph flushes (`maybeRunGraph` → `flushPendingChanges` → `emitEvents`). Only happens with existing IDB data because cache restoration triggers eager data processing that overlaps with Svelte's render cycle. Without IDB data, fetches arrive async after render completes. Both the official `@tanstack/svelte-db` `useLiveQuery` (uses `includeInitialState: true`) and our custom version have bare `$state` mutations (`status = ...`, `syncDataFromCollection(...)`) in the callback. Potential fix: wrap callback mutations in `queueMicrotask` to defer them out of derivation context. Affects `src/lib/tanstack-debug/useLiveQuery.svelte.js` and all imports of `@tanstack/svelte-db` `useLiveQuery`. Could also be an upstream `@tanstack/svelte-db` issue (v0.1.69).

- atproto scrobbling — on play, write an `fm.teal.alpha.feed.play` record to the user's PDS. Uses teal.fm's lexicon for cross-app interop (shared listening history across apps). Requires: OAuth account linking in settings, opt-in checkbox, one `createRecord` call per play. Fields to fill: `trackName`, `originUrl`, `musicServiceBaseDomain`, `playedTime`, `submissionClientAgent` (`org.radio4000/<version>`). Optionally enrich with MusicBrainz IDs. No dual-write, no sync — append-only, fire-and-forget. Proves out atproto OAuth plumbing needed for everything else. See also: teal.fm lexicon, npmx.dev Constellation pattern, r4 atproto spec.
- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.
- Local file player for mp3/m4a — changes product direction significantly.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
