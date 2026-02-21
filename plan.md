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

### Bugs

- **`internet-indicator.svelte` — event listener leak.** `$effect` adds `window.addEventListener('offline'/'online')` but never returns a cleanup function. Every re-run of the effect adds more listeners. Fix: return `() => { window.removeEventListener(...) }`.
- **Missing `.catch()` on fire-and-forget promises.** `ensure-track.svelte:18` (`sdk.tracks.readTrack().then(...)` — no catch), `search/+page.svelte:143` (`Promise.all(promises).then(...)` — no catch, so `channelsLoading` never resets on error), `[slug]/+page.svelte:58` (`Promise.all(slugs.map(findChannelBySlug)).then(...)` — no catch). All should have `.catch()` or use `await` with try/catch.
- **`live-chat.svelte` uses deprecated `substr`.** Line 18: `.substr(2, 9)` → should be `.slice(2, 11)` or `.substring(2, 11)`.
- **`joinAutoRadio` race condition — uses wrong deck ID.** `api.ts:659–674`: after `await playTrack(deckId, ...)` it reads `appState.active_deck_id` instead of using the original `deckId`. If the user switches decks during the await, playlist and auto-radio state get applied to the wrong deck. Fix: use `deckId` throughout instead of re-reading `active_deck_id`.
- **`broadcast.js:683` — fire-and-forget async without `void`.** `playBroadcastTrack()` called without `await` or `void`, so unhandled rejections escape. Line 725 correctly uses `void seekWhenReady()` — inconsistent.
- **`player.svelte:158–164` — track duration update fires on every play.** `updateTrack(channel, track.id, {duration})` is called each time the user plays a track with missing duration, even if it was already written. Could debounce or check if already set.

### Player & audio edge cases (investigate)

- **`seekWhenReady` job cancellation race** (`broadcast.js:292–324`). Between the final `seekJobSeqByDeck` check and the `play(deckId)` call, a new job could start. The old job's `play()` still fires.
- **`userHasPlayed` not reset between playlists** (`player.svelte:106`). When a deck switches from one channel to another, the flag carries over and may cause unexpected autoplay decisions.
- **Ephemeral broadcast tracks have `slug: null`** (`broadcast.js:360–435`). If a broadcaster sends a non-DB track without `track_url`, the listener can't look it up.
- **`applyBroadcastState` rebuilds `managedIds` inside loop** (`broadcast.js:607–631`). O(n²) for number of decks — fine now but may matter with more decks.

### Route-level cleanup

- **Redundant channel-by-slug `useLiveQuery` in ~7 child routes.** `[slug]/+layout.svelte` already queries the channel, but `followers/`, `following/`, `edit/`, `map/`, `batch-edit/`, `delete/`, `tracks/[tid]/delete/` each create their own `useLiveQuery` for the same slug. Should use context from the layout.
- **`followers/+page.svelte` and `following/+page.svelte` are near-identical.** Lines 1–58 differ only in variable names (`followers`/`following`, `readFollowers`/`readFollowings`). Could be one shared component.
- **`batch-edit/+page.svelte:31` loads ALL `trackMetaCollection` unfiltered.** Creates a live query over every track-meta row. Could filter by the channel's media_ids or use `collection.state` directly.
- **`edit/+page.svelte` overengineered lock-then-get.** Lines 16–32 create a `useLiveQuery`, a `$state` for channelId, an `$effect` to lock it once, and a `$derived` to read it back. Could be a single `$derived`.
- **`history/` and `stats/` duplicate nav buttons.** Both pages have identical `<menu><a href="/stats">...<a href="/history">...</menu>` markup. Extract to a shared component or layout.
- **`stats/+page.svelte:45` — no `.catch()` on `navigator.storage.estimate()`.** Will silently fail if storage API rejects.
- **`[slug]/tracks/[tid]/(tabs)/+layout.svelte:43–85` — manual state sync defeats reactivity.** A `detail` state object is created, then an `$effect` copies all derived values into it. Could use `$derived` directly.

### Duplicated code worth extracting

- **`formatDuration` × 3 + inline × 1.** Identical function in `track-meta-r5.svelte:11`, `track-meta-youtube.svelte:9` (both take seconds), near-identical `formatLength` in `track-meta-musicbrainz.svelte:8` (takes ms). Plus inline `Math.floor(duration/60):padStart` in `batch-edit/track-row.svelte:103`. Extract to `dates.ts`.
- **Media element listener binding pattern × 2.** `player.svelte:246–267` and `deck-compact-bar.svelte:60–99` both do: addEventListener for timeupdate/durationchange/loadedmetadata, seed initial values, return cleanup. `deck-compact-bar` adds a rAF polling loop on top. Could share a helper like `bindMediaProgress(el, onTime, onDuration)`. These two components are in general very similar. Could they share any primitives (components)? abstractions.
- **Raw/formatted toggle × 3.** All three `track-meta-*.svelte` components repeat `let showRaw = $state(false)` + toggle button with identical aria-label logic. Could be a shared snippet or wrapper component.
- **Metadata upsert pattern × 3.** `metadata/youtube.js`, `metadata/musicbrainz.js`, `metadata/discogs.js` all repeat the same get-or-insert + update logic on `trackMetaCollection`. Extract to `upsertTrackMeta(mediaId, field, data)`. tanstack db collections also have some writeUpsert? is that it?
- **`writeBatch` + `writeUpsert` loop × 5.** Appears in `collections/channels.ts`, `collections/tracks.ts`, `views.svelte.ts`. Extract to `batchUpsert(collection, items)`.
- **Filter extraction from `parseLoadSubsetOptions` × 12.** Both `collections/tracks.ts` and `collections/channels.ts` repeat `.filters.find((f) => f.field[0] === '...' && f.operator === '...')?.value` many times. A helper like `getFilter(options, field, op)` would clean this up. Only do if we have a good, clear abstraction. Maybe tanstack has one already in node_modules. else we can do it.
- **Modal dialog `$effect` pattern × 4.** `track-add-dialog`, `track-edit-dialog`, `share-dialog`, `shortcuts-dialog` all repeat the same `$effect(() => { if (appState.modal_X) { open(...); appState.modal_X = null } })`. Could be a shared helper. lib/modal.svelte ? not sure. modal vs dialog naming as well?
- **Filter tracks by slug × 3.** `api.ts:234`, `api.ts:281`, `collections/tracks.ts:297` all do `[...tracksCollection.state.values()].filter((t) => t?.slug === slug)`. Extract to a helper. Not sure. It's already pretty clean. Does a filter.
- **`sortByNewest` exists but isn't reused.** Defined in `api.ts:35` but `stats/+page.svelte:117` and `track-related.svelte:12` inline the same `.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))` instead of importing it.

### State & data layer

- **`app-state.svelte.ts` queue persistence bug.** STATE_KEY write (line 169) skips listening decks (`if (deck.listening_to_channel_id) continue`), but QUEUE_KEY write (line 180–185) iterates all decks — so listening decks get their queue persisted and restored to wrong decks on reload. This is important one to verify.
- **`broadcasts.js:118–134` — subscription + event listener never cleaned up.** Realtime subscription has no unsubscribe. `visibilitychange` listener added at module load, never removed.
- **`ensureTracksLoaded` race condition** (`tracks.ts:297`). Between checking `existing.length` and calling `startSyncImmediate()`, parallel callers can pass the check and trigger duplicate fetches.
- **`views.ts:26–36` — `createView()` doesn't await insert.** Returns before `viewsCollection.insert()` completes. If component unmounts during insert, data is lost.
- **`reorderPinnedViews()` updates views in a loop** (`views.ts:84`). Calls `updateView()` per item instead of `writeBatch()`. Could batch. 
- **`query-cache-persistence.ts:46` — debounce timer not flushed on unmount.** Pending persist data can be lost if the page closes before the timer fires. Should flush on `beforeunload`.
- **`query-cache-persistence.ts:101–114` — hardcoded query exclusions without docs.** `'todos-cached'` looks like a leftover from a demo. `'channels'` with `'shuffle'` excluded with no comment. Document inline comments why we did/do this. User knows
- **`queue-panel.svelte:66` — history query scans entire `playHistoryCollection`** without filter or limit. Already noted in plan performance audit, now confirmed.
- **`inArray(tracks.id, [''])` in `views.svelte.ts:141`** — returns empty "return no results" by querying for `id === ''`. Works but fragile; a `.limit(0)` would be clearer intent. 

### Accessibility

- **Click handlers on non-interactive elements.** `player.svelte:282` (`<header onclick>`), `player.svelte:458` (`<footer onclick>`), `cover-flip.svelte:74` (`<div onclick>`), `track-card.svelte:121` (`<h3 onclick>`), `r4-discogs-resource.svelte` (`<li onclick>`), `draggable-panel.svelte:98` (`<header onmousedown>`). These need `<button>`, or `role="button"` + `tabindex="0"` + keyboard handler.
- **`channel-card.svelte:41` — `tabindex="0"` on `<article>` without `role` or `aria-label`.** The `svelte-ignore a11y_no_noninteractive_tabindex` comment suppresses the warning rather than fixing it.

### CSS & styles

- **Duplicated badge styles in `base.css`.** `.badge` (line 221) and `.channel-badge` (line 88) have nearly identical rules. Merge into one and document in debug/buttons

### Utils, search & metadata

- **`utils.ts` — `parseSearchTokens()` is exported but never used.** Dead code, safe to remove.
- **`utils.ts:145` — `timeAgo()` doesn't handle future dates.** Negative `durationMs` still returns `'just started'`. Guard with `Math.max(0, durationMs)` or return a "future" label. and should be in lib/dates?
- **`discogs-core.js:61` — `.replace(' ', '-')` only replaces the first space.** Should be `.replace(/ /g, '-')` or `.replaceAll(' ', '-')`.
- **`discogs-core.js:6–8` — in-memory fetch cache grows unbounded.** 5-min TTL but no eviction. Long sessions can accumulate many entries. Could move to db collection with cache
- **`search-fts.js:8–12` — incomplete PostgREST sanitization.** `RE_FILTER_CHARS` strips `,()` but not `&|!*"` which can break queries.
- **`youtube.js:61–107` — partial batch failure leaves inconsistent state.** If batch 2 fails, batch 1 data is already in `trackMetaCollection`. Return value doesn't reflect partial success.
- **`keyboard.js:52–53` — calling `initializeKeyboardShortcuts()` multiple times adds duplicate listeners.** Should guard or return/reuse cleanup function.
- **`focus.ts:78` — `previous?.focus()` in trap destroy could fail** if the previously focused element was removed from DOM during the trap's lifetime.
- **`dates.js:2` — `'en-DE'` locale hardcoded** in `formatDate()`. Produces German-style dates for English text. Intentional? Document or make configurable. Not intentional. Should respect user.
- **`types.ts` — `Deck` type mixes UI state and data.** `queue_panel_width`, `channels_display`, `channels_filter` are UI concerns living alongside data fields. Consider splitting. really, it is deck_width now.  channel_display and filter don't belong on deck, how are they used here? present me
- **No rate limiting in any metadata fetcher.** YouTube, MusicBrainz, Discogs all make HTTP requests without backoff. Risk of IP blocks or 429 errors.

### Minor inconsistencies

- **Mixed `useLiveQuery` imports.** 14 files import from `@tanstack/svelte-db`, 11 from the custom `$lib/tanstack/useLiveQuery.svelte`. The custom version fixes `state_unsafe_mutation`. Already tracked in "Needs research" below but the file count is now concrete: `layout-header`, `player`, `button-follow`, `history/+page`, `broadcasts/+page`, `[slug]/edit`, `auth/+page`, `[slug]/map`, `[slug]/batch-edit`, `[slug]/trackids`, `[slug]/delete`, `[slug]/tracks/[tid]/(tabs)/+layout`, plus 2 debug pages. Consider a way that we can easily switch between the two globally + per page.
- **Import path with/without `.ts` extension.** 6 files import `from '$lib/utils.ts'` while the rest use `from '$lib/utils'`. Cosmetic, but inconsistent. Consistent please

## Needs research

- `state_unsafe_mutation` — **root cause found, partially fixed.** The official `@tanstack/svelte-db` `useLiveQuery` uses `includeInitialState: true` in `subscribeChanges`, which fires `$state` mutations during `$derived` evaluation when IDB-cached data is restored on page load. Our custom `useLiveQuery` avoids this with `includeInitialState: false` + `untrack()` wrappers. **Done:** swapped root layout (`+layout.svelte`) to custom version (was the trigger on `/[slug]` pages). Fixed bare `status = ...` mutation in custom useLiveQuery (also needed `untrack()`). **Remaining:** ~15 files still import `useLiveQuery` from `@tanstack/svelte-db` — will hit the same error if their collections have IDB-cached data on load. Migrate incrementally: `layout-header`, `player`, `button-follow`, `queue-panel`, route pages.

- atproto scrobbling — on play, write an `fm.teal.alpha.feed.play` record to the user's PDS. Uses teal.fm's lexicon for cross-app interop (shared listening history across apps). Requires: OAuth account linking in settings, opt-in checkbox, one `createRecord` call per play. Fields to fill: `trackName`, `originUrl`, `musicServiceBaseDomain`, `playedTime`, `submissionClientAgent` (`org.radio4000/<version>`). Optionally enrich with MusicBrainz IDs. No dual-write, no sync — append-only, fire-and-forget. Proves out atproto OAuth plumbing needed for everything else. See also: teal.fm lexicon, npmx.dev Constellation pattern, r4 atproto spec.
- atproto as backend alternative — sign in with bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- direct IDB collection persistence — disabled due to performance problems. See collection-persistence.ts and docs/plan-tanstack-collection-idb-idea.md.
- Share track_meta between users — collaborative metadata curation. See https://github.com/radio4000/r4-sync-tests/issues/6
