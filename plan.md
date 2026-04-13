# PLAN

Possible improvements. Roughly by priority. Verify before implementing.

Last update (2026-04-13): fixed appearance settings SSR crash, improved search/track filter UX, updated track-card media interactions, and refined homepage/tag-filter UI.

## Done (2026-04-13)

- `/settings/appearance` 500 fixed by guarding browser-only theme detection.
- Channel page description color moved closer to body text.
- Global search track action controls now include filter status and quick clear.
- Channel `/[slug]/tracks` tag dropdown replaced with modal filter panel (tags, sorting, actions, result count).
- Track-card delete action now uses modal dialog confirmation.
- Track artwork is now one-click play/pause with centered overlay state.
- Homepage (logged-in): tags row sizing/alignment adjusted, onboarding todo moved to info panel style, and header actions use standard button background.
- Channel `/[slug]/tracks` tags dialog: "Tags filter" title, "Search tags" placeholder, and icon-based sort controls (mode + direction).
- Channel homepage now shows common follow overlap previews and links to common-following view.
- Added transparent channel matching score model (0-100) near follow button + docs in `docs/matching.md`.
- Channel `/[slug]/tracks` now supports URL-shareable deterministic random order via `order=shuffle&seed=...` (with reshuffle generating a new seed).
- Channel `/[slug]/tracks` tags modal no longer shows global sort chip (`shuffle · desc` etc.) and keeps header title/actions inline and responsive.

## Simplify: rely on types and primitives, fewer layers

- **Broadcast field juggling** — `broadcast.js`: `pickBroadcastFields()` (line 29), `getBroadcastDeckState()` (line 426), ephemeral track construction (line 350). Three hand-rolled serializers. Align types so most disappear.
- **14 sequential $derived in [slug]/+layout.svelte** (lines 104-131) — many used once. `channelHasAuto`, `channelAutoIsPlaying`, `deck` are property accesses on `anyChannelAutoDecks` — inline in markup.
- **Player vs compact bar: same concept, two local contracts** — `player.svelte:76` and `deck-compact-bar.svelte:26` each rebuild "what this deck is showing" with different rules. Both keep their own `lastTrack`/`lastChannel`, both derive display fallbacks, both resolve header channel differently. Extract one shared derivation.

## Backlog

- Channel identity inconsistent: methods pass `{id, slug}` or just `channelId` — could pass views instead, since views already carry channel identity. Easier contract.
- Consolidate page metadata behind `src/lib/components/seo.svelte` — today some routes use raw `<svelte:head>` because `Seo` always appends `| {appName}` and emits OG tags, while many title messages already hardcode `Radio4000` or custom formatting. Refactor `Seo` into the single metadata path for non-debug routes: support plain/full titles, stop baking brand names into i18n title strings, move default title/description in `src/app.html` to config-driven values, and keep route usage consistent.
- `userHasPlayed` not reset between playlists (`player.svelte`) — flag carries over when switching channels, may cause unexpected autoplay. Needs verification and user testing.
- `seekWhenReady` race in `broadcast.js` — between the final `seekJobSeqByDeck` check and `play(deckId)`, a new job could start. Old job's `play()` still fires. Needs verification and user testing.

## One day

- Test RTL support
- `TrackCard` parses `track.description` with LinkEntities on every render. Consider a DB trigger or cache.
- Media Session API — lock screen and notification controls (play/pause/skip/artwork). Needs research: YouTube/SoundCloud iframes set their own `mediaSession`, may conflict. Our next/prev/seek would work (we proxy via iframe APIs), but play/pause and metadata could fight the iframe.
- Duplicate track detection — warn when adding a URL that already exists in the channel. Could also surface in batch-edit (group by URL or `media_id`).
- Musicbrainz/discogs auto-matching has a high error rate. Let users mark metadata as wrong, or show an "unverified" badge.
- `discogs-core.js:6–8` — in-memory fetch cache grows unbounded. 5-min TTL but no eviction. Long sessions accumulate entries. Could move to a db collection.
- Live query accumulation — navigating creates new queries without cleaning up old ones. Unclear if disposed queries are GC'd or leak.
- Play history threshold: a track is recorded the moment it starts playing. Should count only after enough listening: full track if under 2 min, half the duration (max 4 min) otherwise. Open questions: accumulate actual play time vs. furthest position? What about pause/resume? Should skipped tracks get a `skipped` flag or disappear? Currently `capture('player:track_play')` fires in `playTrack()` (api.ts); would move to `player.svelte` using `timeupdate`. Needs `getPlayCountThreshold(durationSec)` helper and a way to pass `reason_start` to the player.
- Ephemeral broadcast tracks have `slug: null` (`broadcast.js`) — listeners can't look up non-DB tracks without `track_url`.
- `applyBroadcastState` rebuilds `managedIds` inside loop — O(n²) for deck count. Fine now, may matter later.

## Needs research

- Broadcast hard-fail cleanup — current auto-stop is client-side (idle/no-deck monitor). Consider server-side TTL/heartbeat expiry for cases like sudden process kill or network drop during tab close.

- Views beyond tracks — Views are currently tracks-centric: `ViewSource` describes track filters (`channels`, `tags`, `search`), `queryView` returns tracks, `processViewTracks` sorts/filters tracks. Explore whether Views could describe channels or mixed results too (e.g. `searchChannelsCombined` already runs parallel to `queryView` on search pages). Questions: would a `ViewResult` with `{tracks, channels}` simplify search pages further, or would it over-abstract a simple parallel call? Would saved views benefit from storing channel results? Is the current split (Views = tracks, channel search = separate) actually the clearest pattern? May conclude the current design is right and the abstraction isn't worth it.

- `fetchQuery` usage review — `queryClient.fetchQuery` appears in component bodies (`followers`, `following`, `related` pages). Review whether these belong in a collection or loader instead.

- atproto scrobbling — on play, write `fm.teal.alpha.feed.play` to the user's PDS via teal.fm's lexicon. Shared listening history across apps. Requires OAuth account linking, opt-in, one `createRecord` per play. Fire-and-forget, no sync. Proves out atproto OAuth plumbing for everything else.

- atproto as backend — sign in with Bluesky, sync channels/tracks. Major architectural shift. See github.com/radio4000/r4atproto
- Shared track_meta — collaborative metadata curation between users. See github.com/radio4000/r4-sync-tests/issues/6
- Hashtag parsing — should `"#one#two"` be one tag or two? Follow Twitter/Bluesky convention. Decide, update LinkEntities test and regexes. Parsing happens in Postgres, not the app — tests should use the same regexes. Same question applies to `parseQuery` in `views.ts`. Tokenizer splits on whitespace only.
