# PLAN

Possible improvements. Roughly by priority. Verify before implementing.

## Release prio

Add things here that we want to do before putting this live on radio4000.com

- set up player.radio4000.com with new website that can serve as the embed iframe target. Could be this same app, but only the /embed route.
- double-test sign up, also with providers
- is it obv how to reach us for help?
- Homepage: feed empty state says "No tracks added in the last 7 days" but could load older data progressively as user scrolls followed channels.

## Backlog

- Send view URI in broadcast payload; listeners resolve locally
- `trackImageUrl` only supports YouTube thumbnails. Support all providers (SoundCloud, etc.) so `trackImageUrl(track)` returns an image for any track, not just YouTube.
- Track related page may be broken. "clio - faces" (https://beta.radio4000.com/good-time-radio/tracks/175ed76b-a97d-44c8-a56c-12968f2b19f0/related) exists multiple times on r4 but related shows "no related information". Check with `r4` CLI against `media_id`.
- Consolidate `channels.svelte` and `channels-view.svelte` — ~95 lines duplicated (view rendering, display mode switcher, canvas state, layout CSS). `channels-view.svelte` is the right abstraction but `channels.svelte` re-implements all display logic instead of delegating. After: data fetching/filtering/pagination stay in `channels.svelte`, rendering lives in `<ChannelsView>` (needs `tuner` mode, `skipSort` for pre-sorted data, snippet slots for header/footer). Followers/following pages unchanged.
- Build a shared historical paging/browser component for `/history` and `/feed`: browse grouped tracks by time windows instead of item count pagination. Start with day-based pages (`?page=` meaning one day slice), but make the grouping/window configurable so week-based views are possible later.
- Hashtag parsing: should `"#one#two"` be one tag or two? Decide, update LinkEntities test and regexes. Parsing happens in Postgres, not the app — tests should use the same regexes, not define new ones. Same question applies to `parseQuery` in `views.ts` — currently `#fish#apples` is one tag `fish#apples`, and `@alice@bob` is one channel `alice@bob`. Tokenizer splits on whitespace only.
- 3D globe map view alongside flat map. Try OGL instead of Three.js. Someday/maybe.
- Test RTL support
- `TrackCard` parses `track.description` with LinkEntities on every render. Consider a DB trigger or cache.
- Media Session API — lock screen and notification controls (play/pause/skip/artwork). Needs research: YouTube/SoundCloud iframes set their own `mediaSession`, may conflict. Our next/prev/seek would work (we proxy via iframe APIs), but play/pause and metadata could fight the iframe.
- Channel page (`/@slug`) could use `processViewTracks` for its inline fuzzy+tag filter. Works fine now, low priority.
- Duplicate track detection — warn when adding a URL that already exists in the channel. Could also surface in batch-edit (group by URL or `media_id`).
- Musicbrainz/discogs auto-matching has a high error rate. Let users mark metadata as wrong, or show an "unverified" badge.
- Local file player for mp3/m4a
- `discogs-core.js:6–8` — in-memory fetch cache grows unbounded. 5-min TTL but no eviction. Long sessions accumulate entries. Could move to a db collection.
- Live query accumulation — navigating creates new queries without cleaning up old ones. Unclear if disposed queries are GC'd or leak.
- Play history threshold: a track is recorded the moment it starts playing. Should count only after enough listening: full track if under 2 min, half the duration (max 4 min) otherwise. Open questions: accumulate actual play time vs. furthest position? What about pause/resume? Should skipped tracks get a `skipped` flag or disappear? Currently `addPlayHistoryEntry` fires in `playTrack()` (api.ts); would move to `player.svelte` using `timeupdate`. Needs `getPlayCountThreshold(durationSec)` helper and a way to pass `reason_start` to the player.
- Channel identity inconsistent: `playChannel` takes `{id, slug}`, broadcast functions take just `channelId`
- `pause(player)` doesn't set `deck.is_playing = false` — `togglePlayPause(deckId)` does. Stale state when calling `pause()` directly
- `togglePlay(player)` skips deck state updates and error handling — calls `player.play()` raw. Near-duplicate of `togglePlayPause(deckId)`. Drop both `togglePlay` and `pause(player)`, make callers use `togglePlayPause(deckId)`.
- Consolidate page metadata behind `src/lib/components/seo.svelte` — today some routes use raw `<svelte:head>` because `Seo` always appends `| {appName}` and emits OG tags, while many title messages already hardcode `Radio4000` or custom formatting. Refactor `Seo` into the single metadata path for non-debug routes: support plain/full titles, stop baking brand names into i18n title strings, move default title/description in `src/app.html` to config-driven values, and keep route usage consistent.

### Player & audio edge cases

- `seekWhenReady` race in `broadcast.js` — between the final `seekJobSeqByDeck` check and `play(deckId)`, a new job could start. Old job's `play()` still fires.
- `userHasPlayed` not reset between playlists (`player.svelte`) — flag carries over when switching channels, may cause unexpected autoplay.
- Ephemeral broadcast tracks have `slug: null` (`broadcast.js`) — listeners can't look up non-DB tracks without `track_url`.
- `applyBroadcastState` rebuilds `managedIds` inside loop — O(n²) for deck count. Fine now, may matter later.

## i18n coverage

Translate missing keys and fix review flags per batch. Use `i18n:review <locale>`, translate, apply with `i18n:apply`, run `i18n`. Brand names/abbreviations identical to English are skipped by sync (Paraglide falls back).

- Batch 1: de (87%), pt (85%), it (84%) — big European languages, lowest coverage
- Batch 2: zh (90%), ko (87%), ar (89%) — major non-Latin languages
- Batch 3: ru (88%), uk (88%), pl (86%) — Slavic cluster
- Batch 4: hi (87%), bn (87%), ur (87%) — South Asian cluster
- Batch 5: eo (87%), ro (85%), vi (87%) — remaining locales

## Needs research

- **`useLiveQuery` migration** — two versions in use: official `@tanstack/svelte-db` (14 files) and custom `$lib/tanstack/useLiveQuery.svelte` (11 files). The official version fires `$state` mutations during `$derived` evaluation when IDB-cached data loads (`state_unsafe_mutation`). Custom version avoids this with `includeInitialState: false` + `untrack()`. Root layout already swapped. ~15 files remain: `layout-header`, `player`, `button-follow`, `queue-panel`, `history/+page`, `broadcasts/+page`, `[slug]/edit`, `auth/+page`, `[slug]/map`, `[slug]/batch-edit`, `[slug]/trackids`, `[slug]/delete`, `[slug]/tracks/[tid]/(tabs)/+layout`, plus debug pages. Need a way to switch globally + per page.
- **atproto scrobbling** — on play, write `fm.teal.alpha.feed.play` to the user's PDS via teal.fm's lexicon. Shared listening history across apps. Requires OAuth account linking, opt-in, one `createRecord` per play. Fire-and-forget, no sync. Proves out atproto OAuth plumbing for everything else.
- **atproto as backend** — sign in with Bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- **Shared track_meta** — collaborative metadata curation between users. See github.com/radio4000/r4-sync-tests/issues/6
