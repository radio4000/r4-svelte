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
4. Opens a compact, active deck if none is open (the queue needs a deck to land on)
5. Starts the scheduled track via `playTrack`
6. Sets playlist first (label from `viewToQuery(view)`, e.g. `@ko002 #jazz`)
7. Marks deck as `auto_radio` and stores rotation params
8. Seeks to the computed offset once the player is ready

The infinity button appears on:

- **Channel layout** (`[slug]/+layout.svelte`) — full channel, view = `{channels: [slug]}`
- **Channel tag sections** (`[slug]/+page.svelte`) — per-tag, view = `{channels: [slug], tags: [tag]}`
- **Tracks page** (`[slug]/tracks/+page.svelte`) — filtered results, view = `{channels: [slug], tags, search}`
- **Search** (`/search/+page.svelte`) — search results, view passed directly from URL

## Deck mode

To a deck, auto-radio and listening to a broadcast are one thing: it follows a clock, not its queue. `player/deck-mode.ts` reads the mode from the deck's fields (`modeOf(deck)`: `queue`, `auto` or `listening`); decks and the player ask it what should play now, whether the deck drifted, how to resync and leave, and whether a track ending plays the next one. Auto-radio does advance on end: its queue is the week's shuffle.

## Drift

One effect in `player.svelte` asks the mode while playing (`isDrifted`):

- Auto-radio: expected track and offset from `playbackState(...)`; skipped for 5s after a join/resync and in a track's first 2s.
- Broadcast: expected offset from `calculateSeekTime(...)` in `broadcast-utils.js`.
- Both use a `2s` tolerance. The result lands in `auto_radio_drifted` or `listening_drifted`.

Drift is detected only by this comparison — range seek and other UI controls do not set `auto_radio_drifted` directly.

`resyncAutoRadio` applies the stored view (`processViewTracks`) before recomputing the deterministic shuffle, so filtered/tag/search auto-radio resyncs correctly.

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
- `player/auto-radio-actions.ts` — `joinAutoRadio`, `resyncAutoRadio`, `leaveAutoRadio`, `rejoinAutoRadio`, the channel "tap play" entry points (re-exported from `api.ts`; imports `player/playback.ts`, never `api.ts`)
- `player/deck-mode.ts` — the deck mode: expected position, drift, resync, leave
- `components/auto-radio-button.svelte` — shared infinity auto button UI across headers/pages/search
- `components/player.svelte` — runs the drift check
- `broadcast-utils.js` — `calculateSeekTime` (speed-aware expected position for listeners)
- `[slug]/+layout.svelte` — full-channel join button
- `[slug]/+page.svelte` — per-tag join buttons
- `[slug]/tracks/+page.svelte` — filtered results join button
- `search/+page.svelte` — search results join button
