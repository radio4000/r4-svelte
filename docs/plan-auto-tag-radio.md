# Auto-radio on views

## Context

Auto-radio plays a channel as synchronized live radio — same track, same second, every listener. A view is the universal filter shape (tags, search, sort, channel combos). Any view that produces tracks can become an auto-radio. Each distinct view is its own radio.

## Design principle

`joinAutoRadio(deckId, tracks, view?)` — one function, one entry point. The view is the radio's identity: `serializeView(view).toString()` differentiates shuffles, `viewToQuery(view)` sets the label. Epoch derived from tracks via `epochFromTracks`, no channel object needed.

## Done

### 1. `auto-radio.ts` — pure functions

`hashString` (DJB2), `epochFromTracks` (oldest track's `created_at`), optional `viewSeed` param on `weeklyShuffle`. Different views produce different shuffles. No view seed = default shuffle.

### 2. `api.ts` — view-based `joinAutoRadio`

`joinAutoRadio(deckId, tracks, view?)` — derives epoch from tracks, view seed from `serializeView`, label from `viewToQuery`. Stores `view.channels?.[0]` as slug for resync compat. `seekToAutoRadioOffset` helper shared with `resyncAutoRadio`.

### 3. `[slug]/+layout.svelte` — full channel

`joinAutoRadio(deckId, autoRadioTracks, {channels: [channel.slug]})`.

### 4. `[slug]/+page.svelte` — per-tag sections

Infinity button on each tag section's play/queue menu. `joinAutoRadio(deckId, tracks, {channels: [slug], tags: [tag]})`.

### 5. `[slug]/tracks/+page.svelte` — filtered results

Infinity button next to Play/Queue when filtering. `joinAutoRadio(deckId, filteredTracks, {channels: [slug], tags, search})`.

### 6. `/search/+page.svelte` — search results

Infinity button next to Play/Queue. Passes the URL-derived view directly: `joinAutoRadio(deckId, tracks, view)`.

### 7. `auto-radio.test.ts` — tests

viewSeed determinism (same/different/no seed), `epochFromTracks` (empty, oldest, order-stable), `hashString` basics. 30 tests total.

## Deferred

### Deck view state

Storing the full view on the deck (e.g. `auto_radio_view?: string`) so `resyncAutoRadio` can re-filter. Currently resync re-fetches the full channel's tracks by slug — works for full-channel auto-radio but not filtered subsets. Re-clicking the button resyncs with the current filter as a workaround.

### Badge text on `deck-compact-bar`

Show view context on the Auto badge. Depends on deck storing the view.

### i18n key

`"auto_radio_join_view": "Auto radio this selection"` — hardcoded title for now.

## Resolved questions

- **Channel-optional views**: solved by `epochFromTracks` — epoch derived from tracks, not channel. Cross-channel and channel-less views work.

## Future

Pinned views in sidebar, mix crate. Same function, same button.

## Verify

1. `bun run check && bun run types`
2. `bun test auto-radio`
3. Manual: `/@slug/tracks` → select tags → infinity button → plays at deterministic offset. Different tags → different shuffle.
4. Manual: `/search` → search → infinity button → auto-radio from search results.
