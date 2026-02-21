# Player UI

You'd think it's simple to build a media player that supports and plays different providers, offers multiple simultaneous players. And maybe it is. This document aims to avoid any confusion as to how we decided to name and architect it.

## Terms

| Term                          | What                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Deck`** (type)             | State object: playback + queue + layout config. Lives in `appState.decks[id]`.                                                                                        |
| **`deck.svelte`**             | Component that renders a `Deck`. Wraps `player.svelte` + `queue-panel.svelte`.                                                                                        |
| **`deck-compact-bar.svelte`** | Compact renderer for a `Deck` (like `deck.svelte`, but a thin bar). Does not own a media element — queries the hidden `deck.svelte`'s via `getMediaPlayer(deckId)`.   |
| **`player.svelte`**           | Media UI inside `deck.svelte`: header, video embed, transport controls. Renders one media element at a time (`<youtube-video>`, `<soundcloud-player>`, or `<audio>`). |
| **`queue-panel.svelte`**      | Queue/history sidebar, injected into `player.svelte` as a children snippet.                                                                                           |

`deck-strip.svelte` loops all decks, splitting them into local and broadcast-listening groups. `+layout.svelte` separately loops compact deck IDs into `deck-compact-bar.svelte` at the layout bottom.

## `Deck` layout flags

Four booleans on the `Deck` type. `compact`/`expanded` are mutually exclusive. The other two are independent.

- **`compact`** — the `Deck` is rendered twice: `deck.svelte` in the strip shrinks to `width:0` (stays in DOM for audio), and `deck-compact-bar.svelte` appears at the layout bottom as the visible UI.
- **`expanded`** — `deck.svelte` goes `position:fixed; inset:0`. LayoutHeader hides. Force-clears `hide_video_player`.
- **`hide_video_player`** — video collapses to 0x0 via CSS. Audio keeps playing.
- **`hide_queue_panel`** — `display:none` on queue panel. Video fills freed space.

Deck ID 1 (the default) is hidden until it has queued tracks, an active track, or play history. Additional decks are always visible once created.
