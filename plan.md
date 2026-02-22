# PLAN

List of possible improvements. Sorted roughly by priority. Verify before implementing.

## Backlog

- make sure "#one#two" parses hashtags as a single '#one%23two' and not two hashtags? decide whats the right way here, update linkentities test, the regexes. remember we parse track.descriptions inside postgres, not in the app. and linkentities test should not define its own, new regex!
- nav.tabs vs div.track-tabs>nav? clean up markup here
- on the track+its meta pages the trackdetailcontext could be cleaned up, less repeated types
- track meta r5 introduces new .tags style (reuse? unify?)
- on track meta pages the toggle json/raw is below output, meaning it disappears when you tap it. put it above so it doesn't jump
- why does <TrackList> have both tracks and playlistTracks props?
- didn't look into why but when i switch between discogs/musicbrainz tabs here my browser blocks for 12 seconds :D https://pg.radio4000.com/oskar/tracks/639c8d7a-e095-49b9-b0a0-cdfdf2dd8af8/discogs
- media query to switch layout header from side to top is too soon. maybe ~900px instead of 768px breakpoint. and do we need 560+640px breakpoints? one of them maybe enough?
- remove the tap to select row(s) on /batch-edit. the input checkbox is enough for this feature
- 3D globe map view in addition to map view. Try with OGL instead of Three.js. Someday/maybe.
- Test RTL-support
- We parse track.description inside TrackCard for links with LinkEntities, consider DB trigger or something to avoid computing this over and over
- OpenGraph share previews — proper `<meta>` tags on channel/track pages so links preview nicely in social/chat apps. Needs server-side data (load functions already fetch channel/track).
- Media Session API — OS-level lock screen / notification controls (play/pause/skip/artwork). Player already has all the hooks; wire up `navigator.mediaSession.metadata` and action handlers.
- Views: channel page (`/@slug`) — could use `processViewTracks` for its inline fuzzy+tag filter. Works fine now, low priority.
- Duplicate track detection — warn when adding a track URL that already exists in the channel. Could also surface duplicates in batch-edit (group by URL or media_id).
- Mark musicbrainz/discogs metadata as wrong — auto-matching has high error rate. Alternative: show "unverified" badge.
- Local file player for mp3/m4a

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

- channel mentions route: add `/@slug/mentions` listing tracks from other channels where `mentions` contains `@slug`

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

## Code cleanup — duplications, bugs, small fixes

Findings from a codebase scan. Roughly sorted by impact. Needs explanation to and confirmation from user.

### Player & audio edge cases (investigate)

- **`seekWhenReady` job cancellation race** (`broadcast.js:292–324`). Between the final `seekJobSeqByDeck` check and the `play(deckId)` call, a new job could start. The old job's `play()` still fires.
- **`userHasPlayed` not reset between playlists** (`player.svelte:106`). When a deck switches from one channel to another, the flag carries over and may cause unexpected autoplay decisions.
- **Ephemeral broadcast tracks have `slug: null`** (`broadcast.js:360–435`). If a broadcaster sends a non-DB track without `track_url`, the listener can't look it up.
- **`applyBroadcastState` rebuilds `managedIds` inside loop** (`broadcast.js:607–631`). O(n²) for number of decks — fine now but may matter with more decks.

### Route-level cleanup

- **`followers/+page.svelte` and `following/+page.svelte` are near-identical.** Lines 1–58 differ only in variable names (`followers`/`following`, `readFollowers`/`readFollowings`). Could be one shared component.
- **`batch-edit/+page.svelte:31` loads ALL `trackMetaCollection` unfiltered.** Creates a live query over every track-meta row. Could filter by the channel's media_ids or use `collection.state` directly.
- **`history/` and `stats/` duplicate nav buttons.** Both pages have identical `<menu><a href="/stats">...<a href="/history">...</menu>` markup. Extract to a shared component or layout.
- **`stats/+page.svelte:45` — no `.catch()` on `navigator.storage.estimate()`.** Will silently fail if storage API rejects.
- **`[slug]/tracks/[tid]/(tabs)/+layout.svelte:43–85` — manual state sync defeats reactivity.** A `detail` state object is created, then an `$effect` copies all derived values into it. Could use `$derived` directly.

### Duplicated code worth extracting

- **Media element listener binding pattern × 2.** `player.svelte:246–267` and `deck-compact-bar.svelte:60–99` both do: addEventListener for timeupdate/durationchange/loadedmetadata, seed initial values, return cleanup. `deck-compact-bar` adds a rAF polling loop on top. Could share a helper like `bindMediaProgress(el, onTime, onDuration)`. These two components are in general very similar. Could they share any primitives (components)? abstractions.
- **Raw/formatted toggle × 3.** All three `track-meta-*.svelte` components repeat `let showRaw = $state(false)` + toggle button with identical aria-label logic. Could be a shared snippet or wrapper component.
- **Metadata upsert pattern × 3.** `metadata/youtube.js`, `metadata/musicbrainz.js`, `metadata/discogs.js` all repeat the same get-or-insert + update logic on `trackMetaCollection`. Extract to `upsertTrackMeta(mediaId, field, data)`. tanstack db collections also have some writeUpsert? is that it?
- **`writeBatch` + `writeUpsert` loop × 5.** Appears in `collections/channels.ts`, `collections/tracks.ts`, `views.svelte.ts`. Extract to `batchUpsert(collection, items)`.
- **Filter extraction from `parseLoadSubsetOptions` × 12.** Both `collections/tracks.ts` and `collections/channels.ts` repeat `.filters.find((f) => f.field[0] === '...' && f.operator === '...')?.value` many times. A helper like `getFilter(options, field, op)` would clean this up. Only do if we have a good, clear abstraction. Maybe tanstack has one already in node_modules. else we can do it.
- **Modal dialog `$effect` pattern × 4.** `track-add-dialog`, `track-edit-dialog`, `share-dialog`, `shortcuts-dialog` all repeat the same `$effect(() => { if (appState.modal_X) { open(...); appState.modal_X = null } })`. Could be a shared helper. lib/modal.svelte ? not sure. modal vs dialog naming as well?
- **Filter tracks by slug × 3.** `api.ts:234`, `api.ts:281`, `collections/tracks.ts:297` all do `[...tracksCollection.state.values()].filter((t) => t?.slug === slug)`. Extract to a helper. Not sure. It's already pretty clean. Does a filter.
- **`sortByNewest` exists but isn't reused everywhere.** Exported from `api.ts`, reused in `track-related.svelte`. `stats/+page.svelte` sorts by `started_at` (different field) so can't reuse directly.

### State & data layer

- **`ensureTracksLoaded` race condition** (`tracks.ts:297`). Between checking `existing.length` and calling `startSyncImmediate()`, parallel callers can pass the check and trigger duplicate fetches.
- **`createView()` insert is synchronous** — localStorage collection, not async. No bug here (was a false alarm in code review).
- **`reorderPinnedViews()` updates views in a loop** (`views.ts:84`). Calls `updateView()` per item instead of `writeBatch()`. Could batch.
- **`queue-panel.svelte:66` — history query scans entire `playHistoryCollection`** without filter or limit. Already noted in plan performance audit, now confirmed.
- **`inArray(tracks.id, [''])` in `views.svelte.ts:141`** — returns empty "return no results" by querying for `id === ''`. Works but fragile; a `.limit(0)` would be clearer intent.

### Accessibility

- **Click handlers on non-interactive elements.** `player.svelte:282` (`<header onclick>`), `player.svelte:458` (`<footer onclick>`), `cover-flip.svelte:74` (`<div onclick>`), `track-card.svelte:121` (`<h3 onclick>`), `r4-discogs-resource.svelte` (`<li onclick>`), `draggable-panel.svelte:98` (`<header onmousedown>`). These need `<button>`, or `role="button"` + `tabindex="0"` + keyboard handler.
- **`channel-card.svelte:41` — `tabindex="0"` on `<article>` without `role` or `aria-label`.** The `svelte-ignore a11y_no_noninteractive_tabindex` comment suppresses the warning rather than fixing it.

### Utils, search & metadata

- **`discogs-core.js:6–8` — in-memory fetch cache grows unbounded.** 5-min TTL but no eviction. Long sessions can accumulate many entries. Could move to db collection with cache
- **`youtube.js:61–107` — partial batch failure leaves inconsistent state.** If batch 2 fails, batch 1 data is already in `trackMetaCollection`. Return value doesn't reflect partial success.
- **`types.ts` — `Deck` type mixes UI state and data.** `queue_panel_width` is UI concern. `channels_display` and `channels_filter` are already on `AppState`, not on `Deck`. Present to user.
- **No rate limiting in any metadata fetcher.** YouTube, MusicBrainz, Discogs all make HTTP requests without backoff. Risk of IP blocks or 429 errors. This is okay for now. As long as we handle rate limiting and surface the error.

### Minor inconsistencies

- **Mixed `useLiveQuery` imports.** 14 files import from `@tanstack/svelte-db`, 11 from the custom `$lib/tanstack/useLiveQuery.svelte`. The custom version fixes `state_unsafe_mutation`. Already tracked in "Needs research" below but the file count is now concrete: `layout-header`, `player`, `button-follow`, `history/+page`, `broadcasts/+page`, `[slug]/edit`, `auth/+page`, `[slug]/map`, `[slug]/batch-edit`, `[slug]/trackids`, `[slug]/delete`, `[slug]/tracks/[tid]/(tabs)/+layout`, plus 2 debug pages. Consider a way that we can easily switch between the two globally + per page.

## Needs research

- `state_unsafe_mutation` — **root cause found, partially fixed.** The official `@tanstack/svelte-db` `useLiveQuery` uses `includeInitialState: true` in `subscribeChanges`, which fires `$state` mutations during `$derived` evaluation when IDB-cached data is restored on page load. Our custom `useLiveQuery` avoids this with `includeInitialState: false` + `untrack()` wrappers. **Done:** swapped root layout (`+layout.svelte`) to custom version (was the trigger on `/[slug]` pages). Fixed bare `status = ...` mutation in custom useLiveQuery (also needed `untrack()`). **Remaining:** ~15 files still import `useLiveQuery` from `@tanstack/svelte-db` — will hit the same error if their collections have IDB-cached data on load. Migrate incrementally: `layout-header`, `player`, `button-follow`, `queue-panel`, route pages.

- atproto scrobbling — on play, write an `fm.teal.alpha.feed.play` record to the user's PDS. Uses teal.fm's lexicon for cross-app interop (shared listening history across apps). Requires: OAuth account linking in settings, opt-in checkbox, one `createRecord` call per play. Fields to fill: `trackName`, `originUrl`, `musicServiceBaseDomain`, `playedTime`, `submissionClientAgent` (`org.radio4000/<version>`). Optionally enrich with MusicBrainz IDs. No dual-write, no sync — append-only, fire-and-forget. Proves out atproto OAuth plumbing needed for everything else. See also: teal.fm lexicon, npmx.dev Constellation pattern, r4 atproto spec.
- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
