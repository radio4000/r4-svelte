# Broadcast feature

This allows any user to broadcast (sync) their `appState.decks` to listeners in realtime via Supabase.

A user broadcasts as their channel. The broadcast's `decks` JSONB column mirrors the local deck state (`BroadcastDeckState[]`). Listeners subscribe and play along. When the broadcaster changes tracks, seeks, or adjusts any deck - including volume - listeners are updated.

```
broadcaster: appState.decks → broadcast.decks (remote) → realtime → listeners
```

## Core functions

- `startBroadcast` / `stopBroadcast` — broadcaster creates/removes the remote row
- `joinBroadcast` / `leaveBroadcast` — listener subscribes/unsubscribes
- `upsertRemoteBroadcast` — pushes current deck state to remote (called automatically on track changes)
- `calculateSeekTime` — computes expected listener seek position from broadcast state (speed-aware)

## Broadcaster cleanup

Broadcast cleanup is handled inside `broadcast.js` liveness monitoring (not UI handlers):

- If no local broadcaster deck is left (all decks closed or only listener decks remain), broadcast stops.
- If no local broadcaster deck has a currently playing track for `10s`, broadcast stops.
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

- `broadcast.js` — core logic
- `tanstack/collections/broadcasts.js` — collection with realtime subscription
- `broadcasts/+page.svelte` — list page
- `broadcast-controls.svelte` — UI

## Types

See `types.ts`: `Deck`, `BroadcastDeckState`, `BroadcastWithChannel`
