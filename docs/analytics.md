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

`identify(userId)` and `reset()` are exported from `$lib/analytics` and called in `+layout.svelte`:

- On opt-in: if a user is already logged in, they are identified immediately
- On login: `identify(user.id)` links future events to the user
- On logout: `reset()` unlinks the session so anonymous events don't bleed across users

All three helpers are no-ops when the user has not opted in.

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

## What is tracked (when opted in)

- Pageviews (every `afterNavigate`)
- Any custom events explicitly captured with `capture()`

## What is never tracked

- Users who have not opted in
- Personal data beyond what PostHog collects by default (IP is anonymised by EU hosting)

## Code references

- [Analytics module usage](https://github.com/radio4000/r4-sync-tests/search?q=%22%24lib%2Fanalytics%22+path%3Asrc&type=code)
- [Tracked analytics events (`capture()` call sites)](https://github.com/radio4000/r4-sync-tests/search?q=%22capture%28%22+path%3Asrc&type=code)
