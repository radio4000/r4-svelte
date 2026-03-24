# Analytics

R5 uses [PostHog](https://posthog.com) for product analytics and web analytics. It is **opt-in** — nothing is sent until the user explicitly enables it in settings.

## Setup

- PostHog project: EU cloud (`https://eu.i.posthog.com`)
- PostHog is initialized lazily in `src/lib/analytics.ts` — only when the user first opts in
- Pageview capture is manual (SPA-aware, fired in `afterNavigate` in `+layout.svelte`)

## Opt-in

The `appState.analytics_opt_in` boolean (default `false`) controls whether data is sent. Users toggle it at `/settings/analytics`.

When the value changes, PostHog's `opt_in_capturing()` / `opt_out_capturing()` is called reactively in `+layout.svelte`.

## Identity

All analytics events are anonymous. No person profiles are created, and no user IDs are sent to PostHog. Each device gets a random `distinct_id` from PostHog automatically, which allows per-device analysis without linking events to real users.

The `identify()` and `reset()` functions are commented out in `src/lib/analytics.ts`.

## Capturing custom events

Import and call `capture()` from `$lib/analytics`:

```ts
import {capture} from '$lib/analytics'

capture('track_played', {channel_slug: 'my-channel'})
```

The helper is a no-op when the user has not opted in, so call sites don't need to guard themselves.

## Event conventions

- Use `snake_case` for event names
- Use `snake_case` for property keys
- Prefer specific names over generic ones: `track_played` not `click`

## Error tracking

Unhandled client errors are sent to PostHog as `$exception` events via the `handleError` hook in `src/hooks.client.ts`. This uses PostHog's built-in error tracking, so errors appear in the Error Tracking view in the PostHog dashboard.

`captureError(error)` in `analytics.ts` is the underlying helper — it respects the same opt-in guard as `capture()`. You can call it directly in explicit `catch` blocks when you want to report a caught error:

```ts
import {captureError} from '$lib/analytics'

try {
	await riskyOperation()
} catch (err) {
	captureError(err)
}
```

## What is tracked (when opted in)

- Pageviews (every `afterNavigate`)
- Player events: track play/end, channel play, auto-radio, broadcast join/start/end
- Unhandled client errors (via `handleError` hook)
- All `capture()` calls are logged to console via `log.debug` even when opted out

Events use `player:*` and `broadcast:*` prefixes. Play start/end reasons are defined as `PlayStartReason` and `PlayEndReason` in `types.ts`. Search [`capture(`](https://github.com/radio4000/r4-sync-tests/search?q=%22capture%28%22+path%3Asrc&type=code) for all call sites.

## What is never tracked

- Users who have not opted in
- Personal data beyond what PostHog collects by default (IP is anonymised by EU hosting)

## Code references

- [Analytics module usage](https://github.com/radio4000/r4-sync-tests/search?q=%22%24lib%2Fanalytics%22+path%3Asrc&type=code)
- [Tracked analytics events (`capture()` call sites)](https://github.com/radio4000/r4-sync-tests/search?q=%22capture%28%22+path%3Asrc&type=code)
