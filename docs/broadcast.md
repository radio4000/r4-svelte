# Broadcast feature

This allows any user to broadcast (sync) their `appState.decks` to listeners in realtime via Supabase. Broadcast syncs the core player's deck state — it is independent of [/mix](mix.md).

A user broadcasts as their channel. The broadcast's `decks` JSONB column mirrors the local deck state (`BroadcastDeckState[]`). Listeners subscribe and play along. When the broadcaster changes tracks, seeks, or adjusts any deck - including volume - listeners are updated.

```
broadcaster: appState.decks → broadcast.decks (remote) → realtime → listeners
```

## Core functions

- `startBroadcast` / `stopBroadcast` — broadcaster creates/removes the remote row
- `joinBroadcast` / `leaveBroadcast` — listener subscribes/unsubscribes
- `upsertRemoteBroadcast` — pushes current deck state to remote (called automatically on track changes)
- `calculateSeekTime` — computes expected listener seek position from broadcast state (speed-aware)

## Drift and resync

Listeners continuously compare local playback against expected broadcast position.

- Expected position is derived from `track_played_at` / `seeked_at` / `seek_position` + `speed`.
- Re-seek is skipped if already within a `2s` tolerance.
- `deck.listening_drifted` is computed in `player.svelte` from this expected position.

## Header UI

Deck/channel headers now show listening context as linked `@who` + sync-broadcast icon + linked `@whom`:

- `who` = broadcaster slug
- `whom` = current track slug when available, fallback to playlist/listening slug
- sync icon button reflects drift state and can trigger re-sync (`joinBroadcast`)

## Files

- `broadcast.js` — core logic
- `tanstack/collections/broadcasts.js` — collection with realtime subscription
- `broadcasts/+page.svelte` — list page
- `broadcast-controls.svelte` — UI

## Types

See `types.ts`: `Deck`, `BroadcastDeckState`, `BroadcastWithChannel`
