# Broadcast feature

This allows any user to broadcast (sync) their `appState.decks` to listeners in realtime via Supabase.

A user broadcasts as their channel — one `broadcast` row per channel (PK `channel_id`). The row's `decks` JSONB column mirrors the broadcaster's local deck state (`BroadcastDeckState[]`): broadcasting ships _all_ the broadcaster's non-listener decks. To keep a deck off air, pause or remove it.

Joining replaces the listener's current decks — they're torn down, then one listener deck is spawned per broadcaster deck (matched by `track_id`, else positionally). When the broadcaster changes tracks, seeks, or adjusts any deck — including volume — listeners update.

Sending is an observer: `broadcast.js` watches the broadcaster's decks. Deck and playback code don't call it.

Broadcast cleanup is handled inside `broadcast.js` liveness monitoring (not UI handlers).

## Drift and resync

Listeners continuously compare local playback against expected broadcast position.

## Files

- `src/lib/broadcast.js` — core logic (realtime channels, join, send, liveness)
- `src/lib/broadcast-teardown.js` — a listener's subscriptions and leaving them
- `src/lib/broadcast-utils.js` — pure wire-format and sync helpers (tested)
- `src/lib/collections/broadcasts.js` — collection with realtime subscription
- `src/routes/broadcast/+page.svelte` — the broadcaster's on-air view: whether your own channel is live.
- `src/lib/components/broadcast-controls.svelte` — UI
