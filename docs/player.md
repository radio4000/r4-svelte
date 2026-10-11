# Player

Uses [media-chrome](https://www.media-chrome.org/) with [media-now](https://github.com/radio4000/media-now) for media abstraction. Supports YouTube, SoundCloud, and audio file playback.

## Architecture

- `media-now` handles provider abstraction
- `youtube-video-custom-element.js` - YouTube IFrame API wrapper
- `soundcloud-player-custom-element.js` - SoundCloud Widget API wrapper
- Both implement HTMLMediaElement-compatible interface for media-chrome

## Multi-deck

The player supports multiple independent decks. Each deck has its own queue, active track, playback speed, volume, and layout config. Deck state lives in `appState.decks` — keyed by numeric ID.

## Shared controls

`speed-control.svelte` and `volume-control.svelte` are shared between `player.svelte` and `deck-compact-bar.svelte`.

## Key patterns

- Only render one player at a time, branching on `provider` (`{#if provider === 'youtube'}` / soundcloud / audio)
- Both players have `slot="media"` when active
- YouTube URLs converted to embed format (`/embed/VIDEO_ID`) in `#initializePlayer()`
- Use `loadVideoById()` for track changes, avoiding player re-initialization

## Keyboard navigation

Arrow keys navigate tracklists — up/down to move, enter/space to play the selected track.

## Seeking

`seekTo(seconds)` in `api.ts` queries the player element directly (`youtube-video` or `soundcloud-player`) and sets `currentTime`. The custom elements' setters await their internal `#loadComplete` promise before calling the provider API.

When seeking after a track change, use `requestAnimationFrame` to wait for Svelte to render the new element.

## State

`appState` stores app, user and player states.
The live `player.svelte` copies playback position and duration into `deck.media_current_time` / `media_duration` so the compact bar can show progress without its own media element.
`captureEventsCollection` records play events with start/end reasons (see [capture events](play-history.md)).

## Auto-radio

See [auto-radio.md](auto-radio.md).

## Layout

See [decks.md](decks.md) for the full component tree, layout flags, and deck anatomy.

## Background / lock-screen playback

Auto-advance and lock-screen controls (`navigator.mediaSession`) must keep working while the tab is backgrounded or the screen is locked. Browsers fight this; the workarounds are quarantined in two modules, wired up by `player.svelte`:

- `src/lib/player/media-session.svelte.ts` — lock-screen controls, kept ours by reasserting against YouTube's iframe
- `src/lib/player/stall-recovery.svelte.ts` — detects and nudges playback that stalled while backgrounded/locked

Platform gotchas (rAF suspension, iOS `.play()` failures, battery policy, Firefox…) are documented in those modules' header comments — read them before touching the playback path. `wake-lock.js` keeps the screen on while playing.
