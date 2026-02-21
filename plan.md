# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Backlog

- plan-views.md and plan-pins.md
- make sure "#one#two" parses hashtags as a single '#one%23two' and not two hashtags? decide whats the right way here, update linkentities test, the regexes. remember we parse track.descriptions inside postgres, not in the app. and linkentities test should not define its own, new regex!
- meta-toolbar should be <menu>, not div
- nav.tabs vs div.track-tabs>nav? clean up markup here
- on the track+its meta pages the trackdetailcontext could be cleaned up, less repeated types
- track meta r5 introduces new .tags style (reuse? unify?)
- on track meta pages the toggle json/raw is below output, meaning it disappears when you tap it. put it above so it doesn't jump
- why does <TrackList> have both tracks and playlistTracks props?
- didn't look into why but when i switch between discogs/musicbrainz tabs here my browser blocks for 12 seconds :D https://pg.radio4000.com/oskar/tracks/639c8d7a-e095-49b9-b0a0-cdfdf2dd8af8/discogs
- media query to switch layout header from side to top is too soon. maybe ~900px instead of 768px breakpoint. and do we need 560+640px breakpoints? one of them maybe enough?
- remove the tap to select row(s) on /batch-edit. the input checkbox is enough for this feature
- if i go to /search, write #dub, click queue all, it logs -->
  api.ts:276 r5.api addToPlaylist: no deck {deckId: 1} addToPlaylist @ api.ts:276 queueSearchResults @ +page.svelte:122 handleClick @ button-feedback.svelte:23
  it is correct i have no deck, but maybe it could just make what it needs?
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

## Performance audit — $state proxy & useLiveQuery hotspots

The `syncDataFromCollection` fix (assign `[...values()]` instead of reset-then-push) eliminated ~140ms of blocking per query for large collections. The pattern — mutating a `$state` array item-by-item instead of replacing it — likely exists elsewhere. An agent should:

1. **Grep for `.push(` on `$state` arrays** — any loop or spread-push into a `$state([])` variable is a candidate. Replace with single assignment.
2. **Grep for `useLiveQuery` call sites** — each creates a `createLiveQueryCollection`. Check if the caller actually needs a live query or could use a one-off `collection.get()` instead.
3. **Check `player.svelte`** — has a `useLiveQuery` on `channelsCollection` (~350ms creation per deck). Could use `channelsCollection.get(id)` instead since it only needs a single channel lookup.
4. **Check `queue-panel.svelte`** — has 2 `useLiveQuery` calls (tracks by IDs, play history). The history one scans the full `playHistoryCollection` every time.
5. **Profile `@tanstack/svelte-db` `useLiveQuery`** — root layout now uses our custom copy (swapped to fix `state_unsafe_mutation`). Other components still use the official version. Verify it doesn't have the same reset-then-push pattern.
6. **Count live query accumulation** — navigating back and forth creates new queries without cleaning up old ones (IDs keep incrementing). Check if disposed queries are GC'd or leak.

## Data & migration

- Play history threshold — currently a track is recorded to play history as soon as it starts playing. Instead, a play should count only after the user has listened long enough: the entire track if under 2 min, or half the duration (max 4 min), whichever is longest. Open questions: what happens when the user seeks/skips around within a track (accumulate actual play time vs. furthest position reached?), what about pausing and resuming, and should skipped tracks still appear in history with a `skipped` flag or not at all? Currently `addPlayHistoryEntry` fires in `playTrack()` (api.ts); would move to player.svelte using `timeupdate` events. Needs `getPlayCountThreshold(durationSec)` helper in play-history.ts and a way to pass `reason_start` to the player (e.g. via appState).

## In progress

- Discogs UX pass in progress (track Discogs tab + add-track modal)
  - improve release summary density (track/video/in-channel counts + cleaner status hints per row)
  - dedupe duplicate Discogs videos by URI before matching
  - allow "Use" on Discogs rows in add-track form to prefill URL/title

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

- `state_unsafe_mutation` — **root cause found, partially fixed.** The official `@tanstack/svelte-db` `useLiveQuery` uses `includeInitialState: true` in `subscribeChanges`, which fires `$state` mutations during `$derived` evaluation when IDB-cached data is restored on page load. Our custom `useLiveQuery` avoids this with `includeInitialState: false` + `untrack()` wrappers. **Done:** swapped root layout (`+layout.svelte`) to custom version (was the trigger on `/[slug]` pages). Fixed bare `status = ...` mutation in custom useLiveQuery (also needed `untrack()`). **Remaining:** ~15 files still import `useLiveQuery` from `@tanstack/svelte-db` — will hit the same error if their collections have IDB-cached data on load. Migrate incrementally: `layout-header`, `player`, `button-follow`, `queue-panel`, route pages.

- atproto scrobbling — on play, write an `fm.teal.alpha.feed.play` record to the user's PDS. Uses teal.fm's lexicon for cross-app interop (shared listening history across apps). Requires: OAuth account linking in settings, opt-in checkbox, one `createRecord` call per play. Fields to fill: `trackName`, `originUrl`, `musicServiceBaseDomain`, `playedTime`, `submissionClientAgent` (`org.radio4000/<version>`). Optionally enrich with MusicBrainz IDs. No dual-write, no sync — append-only, fire-and-forget. Proves out atproto OAuth plumbing needed for everything else. See also: teal.fm lexicon, npmx.dev Constellation pattern, r4 atproto spec.
- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.
- Local file player for mp3/m4a — changes product direction significantly.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
