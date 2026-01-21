# Broadcast feature

Radio owners create "broadcasts" in R4.

`startBroadcast`, `stopBroadcast`

Listeners join, watch for track changes in the broadcast, plays, leaves

`joinBroadcast`, `leaveBroadcast`

```
start: startBroadcast → upsertRemoteBroadcast → supabase
join:  joinBroadcast → playBroadcastTrack → (ensureTracksLoaded if needed) → startBroadcastSync
watch: useLiveQuery(broadcastsCollection) → realtime updates collection directly
sync:  supabase change → realtime → playBroadcastTrack
auto:  playTrack → (if broadcasting) → upsertRemoteBroadcast → realtime → listeners
stop:  stopBroadcast → delete remote
```

## State

- `app_state.broadcasting_channel_id` - your broadcast
- `app_state.listening_to_channel_id` - who you're listening to
- `broadcastsCollection` - TanStack collection with realtime subscription
- `supabase.broadcast` - remote table with a "live channel"

## Files

- `broadcast.js` - core functions for start/stop/join/leave
- `tanstack/collections/broadcasts.js` - collection with realtime subscription
- `broadcasts/+page.svelte` - broadcasts list page
- `broadcast-controls.svelte` - ui
- `layout-header.svelte` - broadcast count badge

## Architecture

`broadcastsCollection` handles all broadcast data:

- Single realtime subscription started at module load
- `writeUpsert`/`writeDelete` on realtime events (bypasses sync layer)
- `useLiveQuery(broadcastsCollection)` in UI components for reactive updates
- Syncs `appState.broadcasting_channel_id` automatically

`broadcast.js` handles actions:

- `startBroadcast`/`stopBroadcast` - for broadcasters
- `joinBroadcast`/`leaveBroadcast` - for listeners
- Per-channel realtime sync when listening (`startBroadcastSync`)

## Data access

```js
import {broadcastsCollection, channelsCollection, tracksCollection} from '$lib/tanstack/collections'
import {useLiveQuery} from '@tanstack/svelte-db'

// Reactive list of broadcasts
const broadcasts = useLiveQuery(broadcastsCollection)
const activeBroadcasts = $derived(broadcasts.data ?? [])

// Direct lookup
const broadcast = broadcastsCollection.get(channelId)
const channel = broadcast?.channels // joined channel data
```

## Auto-update Behavior

When a broadcaster (user with `broadcasting_channel_id` set) changes tracks:

1. `playTrack()` is called (via next/previous buttons, auto-advance, etc.)
2. If `broadcasting_channel_id` exists and `startReason !== 'broadcast_sync'`, automatically calls `upsertRemoteBroadcast()`
3. Remote broadcast table updates with new `track_id` and `track_played_at`
4. Supabase realtime triggers
5. `broadcastsCollection` updates via `writeUpsert`
6. Listeners receive update via their per-channel sync and play the new track
