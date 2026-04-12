# Auto-radio

Synchronized "live radio" without a broadcaster. Every listener with the same track set hears the same track at the same offset at the same wall-clock time — no server, no clock sync.

## How it works

A track list is shuffled deterministically each week using a seeded PRNG. The seed combines the epoch (oldest track's `created_at`), the current Sunday-aligned week number, and an optional view seed. Elapsed time since epoch, wrapped modulo the total playlist duration, pins everyone to the same position in the loop.

```
seed = hash(epoch + weekNumber + viewSeed?)
position = elapsed % totalDuration
→ same track, same second, every client
```

The shuffle rotates every Sunday 00:00 UTC. Within a week the order is fixed; across weeks it changes. Different views (tag filters, search queries) produce different shuffles via `serializeView(view)` as the view seed.

## Joining

`joinAutoRadio(deckId, tracks, view?)` is the single entry point.

- **`tracks`** — the actual tracks to play. Already filtered by the caller. The function shuffles and plays these.
- **`view`** — optional metadata describing _how_ those tracks were selected. Not used to fetch or filter — only for: shuffle seed (`serializeView`), playlist label (`viewToQuery`), and slug (`view.channels?.[0]` for resync). Different views on the same tracks produce different shuffles.

Steps:

1. Filters to tracks with known durations (`toAutoTracks`)
2. Derives epoch from oldest track (`epochFromTracks`)
3. Computes weekly shuffle (with view seed if provided)
4. Starts the scheduled track via `playTrack`
5. Sets playlist first (label from `viewToQuery(view)`, e.g. `@ko002 #jazz`)
6. Marks deck as `auto_radio` and stores rotation params
7. Seeks to the computed offset once the player is ready

The infinity button appears on:

- **Channel layout** (`[slug]/+layout.svelte`) — full channel, view = `{channels: [slug]}`
- **Channel tag sections** (`[slug]/+page.svelte`) — per-tag, view = `{channels: [slug], tags: [tag]}`
- **Tracks page** (`[slug]/tracks/+page.svelte`) — filtered results, view = `{channels: [slug], tags, search}`
- **Search** (`/search/+page.svelte`) — search results, view passed directly from URL

## Drift

Drift is computed continuously in `player.svelte` while playing:

- Auto-radio drift: compare current playback (`deck.playlist_track` + `currentTime`) to the expected schedule snapshot from `playbackState(...)`.
- Broadcast drift: compare current playback to `calculateSeekTime(...)` from `broadcast.js`.
- Both use a `2s` tolerance.

Range seek and other UI controls do not directly set `auto_radio_drifted` anymore.

The Auto button uses the same `infinite` icon in both states:

- synced: ghost button style + animated rotating gradient stroke (live/synced signal)
- drifted: normal button style

All infinity auto controls now use one shared UI component: `components/auto-radio-button.svelte`.

Accessibility: with `prefers-reduced-motion: reduce`, the synced icon falls back to a static accent stroke (no animation).

In deck player UI, Auto mode appears as a full-width action row below the channel header and above the video. It combines icon, status text, presence count, and resync action in one button.

`resyncAutoRadio` now re-applies the stored view (`processViewTracks`) before recomputing the deterministic shuffle, so filtered/tag/search auto-radio resyncs correctly.

## Deck state

Auto-radio uses these `Deck` fields:

- `auto_radio` — active flag
- `auto_radio_drifted` — listener deviated from schedule
- `view` — stored view identity/filters used for matching and resync
- `auto_radio_rotation_start` — epoch from oldest track (unix seconds)

`setPlaylist` clears `auto_radio`, so the flags are always set _after_ the playlist call.

## Files

- `player/auto-radio.ts` — pure functions: `weeklyShuffle`, `playbackState`, `toAutoTracks`, `epochFromTracks`, `hashString`, `AutoRadio` class
- `player/auto-radio.test.ts` — determinism, viewSeed, epochFromTracks, hashString tests
- `api.ts` — `joinAutoRadio`, `resyncAutoRadio`
- `components/auto-radio-button.svelte` — shared infinity auto button UI across headers/pages/search
- `components/player.svelte` — computed drift detection + auto/live status UI
- `broadcast.js` — `calculateSeekTime` (speed-aware expected position for listeners)
- `[slug]/+layout.svelte` — full-channel join button
- `[slug]/+page.svelte` — per-tag join buttons
- `[slug]/tracks/+page.svelte` — filtered results join button
- `search/+page.svelte` — search results join button
