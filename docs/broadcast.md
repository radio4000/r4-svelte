# Broadcast feature

This allows any user to broadcast (sync) their `appState.decks` to listeners in realtime via Supabase.

A user broadcasts as their channel — one `broadcast` row per channel (PK `channel_id`). The row's `decks` JSONB column mirrors the broadcaster's local deck state (`BroadcastDeckState[]`): broadcasting ships _all_ the broadcaster's non-listener decks. To keep a deck off air, pause or remove it.

Joining replaces the listener's current decks — they're torn down, then one listener deck is spawned per broadcaster deck (matched by `track_id`, else positionally). When the broadcaster changes tracks, seeks, or adjusts any deck — including volume — listeners update.

```
broadcaster: appState.decks → broadcast.decks (remote) → realtime → listeners
```

## Core functions

- `startBroadcast` / `stopBroadcast` — broadcaster creates/removes the remote row
- `joinBroadcast` / `leaveBroadcast` — listener subscribes/unsubscribes
- `upsertRemoteBroadcast` — pushes current deck state to remote (called automatically on track changes)
- `resyncBroadcastDeck` — re-syncs one drifted listener deck to current broadcast state without rebuilding the deck layout
- `calculateSeekTime` — computes expected listener seek position from broadcast state (speed-aware)

## Broadcaster cleanup

Broadcast cleanup is handled inside `broadcast.js` liveness monitoring (not UI handlers):

- If no local broadcaster deck is left (all decks closed or only listener decks remain), broadcast stops.
- Paused decks stay on air for up to `60s`, giving time to choose a track or recover playback. Playback resuming resets this idle timeout.
- `beforeunload` cleanup still runs from layout to clear local state when tab closes.

## Drift and resync

Listeners continuously compare local playback against expected broadcast position.

- Expected position is derived from `track_played_at` / `seeked_at` / `seek_position` + `speed`.
- Re-seek is skipped if already within a `2s` tolerance.
- `deck.listening_drifted` is computed in `player.svelte` from this expected position.

## Deck UI

Deck/channel headers show listening context as linked `@who` + linked `@whom`:

- `who` = broadcaster slug
- `whom` = current track slug when available, fallback to playlist/listening slug

In the deck player, a full-width Live mode button sits below the header and above the video. It includes mode status, listener count, and re-sync action when drifted (`resyncBroadcastDeck`).

## Files

- `src/lib/broadcast.js` — core logic (realtime channels, join/leave, liveness)
- `src/lib/broadcast-utils.js` — pure wire-format and sync helpers (tested)
- `src/lib/collections/broadcasts.js` — collection with realtime subscription
- `src/routes/broadcast/+page.svelte` — list page
- `src/lib/components/broadcast-controls.svelte` — UI

## Types

See `types.ts`: `Deck`, `BroadcastDeckState`, `BroadcastWithChannel`
