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

Four booleans on the `Deck` type control layout: `compact`, `expanded`, `hide_video_player`, and `hide_queue_panel`. `compact` and `expanded` are mutually exclusive — toggling one clears the other (`toggleDeckCompact`/`toggleDeckExpanded` in `api.js`). Expanding also force-clears `hide_video_player`.

The component tree is always `deck.svelte` > `Player` > `QueuePanel`. The flags don't swap components — they toggle CSS classes (`.compact`, `.expanded`, `.hide-video`, `.hide-queue`) on the `.deck` wrapper. The one exception is `compact`, which renders a separate `deck-compact-bar` in `+layout.svelte` instead of the full deck.

`hide_video_player` and `hide_queue_panel` hide their respective panels via CSS while keeping them in the DOM. `+layout.svelte` derives `anyDeckExpanded` and `compactDeckIds` from `appState.decks` to control top-level rendering.
