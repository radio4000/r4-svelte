# Player

Uses [media-chrome](https://www.media-chrome.org/) with custom YouTube and SoundCloud player elements.

## Architecture

- `youtube-video-custom-element.js` - YouTube IFrame API wrapper
- `soundcloud-player-custom-element.js` - SoundCloud Widget API wrapper
- Both implement HTMLMediaElement-compatible interface for media-chrome

## Key patterns

- Only render one player at a time using `{#if trackType}`
- Both players have `slot="media"` when active
- YouTube URLs converted to embed format (`/embed/VIDEO_ID`) in `#initializePlayer()`
- Use `loadVideoById()` for track changes, avoiding player re-initialization

## Seeking

`seekTo(seconds)` in `api.js` queries the player element directly (`youtube-video` or `soundcloud-player`) and sets `currentTime`. The custom elements' setters await their internal `#loadComplete` promise before calling the provider API.

When seeking after a track change, use `requestAnimationFrame` to wait for Svelte to render the new element.

## State

`app_state` table stores all application state including player state.
`play_history` table tracks played tracks with start/end reasons.

## Layout

The player is (as of this writing) inside the main +layout.svelte,
and is either considered to be in "compact" or "expanded" mode.
