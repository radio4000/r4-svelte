# Capture events

Every user action worth remembering — plays, track ends, skips — is recorded as a generic capture event. These feed both the local history UI and optional analytics (PostHog).

## Data structure

```ts
interface CaptureEvent {
	id: string
	event: string
	properties?: Record<string, unknown>
	created_at: string
}
```

The `event` field names what happened (`player:track_play`, `player:track_end`). Properties carry context: `track_id`, `play_id`, `ms_played`, `end_reason`, `reason_start`, and whatever else the caller passes.

## Functions

```js
addCaptureEvent(event, properties?)  // record any event, returns id
clearCaptureEvents()                 // wipe all local events
buildEndDataMap(allEvents, plays)    // pair track_play with track_end by play_id
```

`addCaptureEvent` is called from `analytics.capture()`, which also forwards to PostHog when the user has opted in. The capture event is always stored locally regardless of opt-in.

## Storage

Local only. The collection persists to localStorage under `r5-capture-events`. No sync to remote — your listening habits remain your own.

## History page

`/history` queries `captureEventsCollection`, filters for `player:track_play` events, and pairs each with its `player:track_end` via `play_id` to show duration and end reason. `/history/stats` aggregates the same data for listening statistics.
