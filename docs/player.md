# Player

Uses [media-chrome](https://www.media-chrome.org/) with [media-now](https://github.com/radio4000/media-now) for media abstraction. Supports YouTube, SoundCloud, and audio file playback.

## Architecture

- `media-now` handles provider abstraction (replaced internal media library)
- `youtube-video-custom-element.js` - YouTube IFrame API wrapper
- `soundcloud-player-custom-element.js` - SoundCloud Widget API wrapper
- Both implement HTMLMediaElement-compatible interface for media-chrome

## Multi-deck

The player supports multiple independent decks. Each deck has its own queue, playback speed, volume, and compact mode. Deck state lives in `appState.decks` — keyed by numeric ID, displayed as A–Z labels.

## Key patterns

- Only render one player at a time using `{#if trackType}`
- Both players have `slot="media"` when active
- YouTube URLs converted to embed format (`/embed/VIDEO_ID`) in `#initializePlayer()`
- Use `loadVideoById()` for track changes, avoiding player re-initialization

## Keyboard navigation

Arrow keys navigate tracklists — up/down to move, enter/space to play the selected track.

## Seeking

`seekTo(seconds)` in `api.js` queries the player element directly (`youtube-video` or `soundcloud-player`) and sets `currentTime`. The custom elements' setters await their internal `#loadComplete` promise before calling the provider API.

When seeking after a track change, use `requestAnimationFrame` to wait for Svelte to render the new element.

## State

`appState` stores app, user and player states.
`playHistoryCollection` tracks played tracks with start/end reasons.

## Layout

The player is (as of this writing) inside the main +layout.svelte,
and is either considered to be in "compact" or "expanded" mode.
