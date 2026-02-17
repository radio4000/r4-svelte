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

## Files

- `broadcast.js` — core logic
- `tanstack/collections/broadcasts.js` — collection with realtime subscription
- `broadcasts/+page.svelte` — list page
- `broadcast-controls.svelte` — UI

## Types

See `types.ts`: `Deck`, `BroadcastDeckState`, `BroadcastWithChannel`
