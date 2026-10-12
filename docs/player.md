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

In decks up to 520px wide, volume and speed share one line below the transport buttons. Wider decks keep the controls on one row.

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

Auto-advance and lock-screen controls (`navigator.mediaSession`) must keep working while the tab is backgrounded or the screen is locked. Browsers fight this; the workarounds are quarantined in these modules, wired up by `player.svelte`:

- `src/lib/player/media-session.svelte.ts` — lock-screen controls, reasserted on `playing`, while playing, and when the tab resumes against YouTube's iframe
- `src/lib/player/stall-recovery.svelte.ts` — detects and nudges playback that stalled while backgrounded/locked
- `src/lib/player/audio-keepalive.js` — an inaudible looping signal while a deck plays (Android), so the page stays audible between tracks and Android doesn't freeze it
- `src/lib/youtube-video-custom-element.js` — track switches: no extra `play()` during `loadVideoById`, no mid-switch pause

Platform gotchas (rAF suspension, iOS `.play()` failures, battery policy, Firefox…) are documented in those modules' header comments — read them before touching the playback path. `wake-lock.js` keeps the screen on while playing.

### Auto-advance on a locked screen

Fixed in #223 (issue #215). A track ended, the next one loaded, played a second or two, then stopped (or went quiet) until unlock.

Cause: between two tracks nothing plays. Firefox stops media control when a media ends (`media.mediacontrol.stopcontrol.aftermediaends`), the browser drops its playing-media state, and Android freezes the locked browser. Our own code made it worse: `play()` calls raced `loadVideoById` (restarting the ended video or re-cueing the new one), and YouTube's mid-switch PAUSED flipped the deck and OS media session to paused.

Fix: `audio-keepalive.js` loops 10s of a constant -66 dBFS DC offset while a deck plays (Android only): long and loud enough for the browser to count (Firefox ignores media under 3s, `media.mediacontrol.eligible.media.duration.s`, and treats samples under -72 dBFS as silent), with no frequency content for any speaker to reproduce. Started once, stopped only on a real pause. The YouTube wrapper lets `loadVideoById` autoplay alone and ignores its mid-switch PAUSED. Defensive, never confirmed needed: resume a pause we didn't ask for within 10s of a switch while hidden; never save a mute YouTube applies itself.

| Browser                                                       | Status                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Firefox Android (Video Background Play Fix, autoplay allowed) | Verified on device, 2026-10-12                                                                                                  |
| Chrome Android                                                | Same fix applies; not verified on device                                                                                        |
| iOS Safari                                                    | Keep-alive off (a second audio element can pause other media). Background `.play()` is unreliable (WebKit 173332). Not verified |
| Desktop                                                       | Unaffected                                                                                                                      |

Tried, in order (Firefox Android unless noted):

- Silent top-frame `<audio>` anchor (Aug 2026, removed in 9406a8e5): 0.05s of zeros that followed `is_playing`, so too short to count and paused at every switch.
- Restore media session controls on `playing` and on resume: kept, for lock-screen prev/next; didn't affect auto-advance.
- Advance 3s before the end while hidden: the next track started, then stopped. Removed.
- Ignore YouTube's mid-switch PAUSED: kept; the next track still stopped a few seconds in.
- Unmute the next track while hidden: the browser paused it. Mute is now restored only once visible.
- Skip `play()` while `loadVideoById` runs (r4 v1 only called `loadVideoById`): kept; still stopped.
- Resume an unrequested pause after a switch: kept as a guard; still stopped.
- Keep-alive, 1s of noise: no effect (under Firefox's 3s minimum).
- Keep-alive, 10s of noise at -60 dBFS: worked, but audible hiss.
- Keep-alive, 15Hz tone at -54 dBFS: inaudible on a phone, but a big subwoofer can reproduce it.
- Keep-alive, -66 dBFS DC offset: works, inaudible.

Ruled out: autoplay policy (allowed in site settings; `media.block-autoplay-until-in-foreground` is off on Android) and YouTube's visibility check (the add-on spoofs it in YouTube frames too).

To re-test: lock the screen, let a track end (Firefox and Chrome on Android, Safari on iOS), and listen to a quiet passage on a good sound system.
