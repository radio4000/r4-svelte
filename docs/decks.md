# Decks player UI

## Terms

| Term                      | What                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deck` (type)             | State object: playback + queue + layout config. Lives in `appState.decks[id]`.                                                                                                                             |
| `deck.ts`                 | Pure helpers to query decks: find by channel/slug, check playing/broadcasting/listening state.                                                                                                             |
| `deck.svelte`             | Renders a `Deck`. Wraps `player.svelte` + `queue-panel.svelte`.                                                                                                                                            |
| `deck-compact-bar.svelte` | Thin-bar renderer for a `Deck`. No media element of its own — controls the hidden `deck.svelte` via `getMediaPlayer(deckId)`, reading progress from mirrored `deck.media_current_time` / `media_duration`. |
| `player.svelte`           | Media UI inside `deck.svelte`: header, video embed, transport controls. Renders one media element at a time (`<youtube-video>`, `<soundcloud-player>`, or `<audio>`).                                      |
| `queue-panel.svelte`      | Queue/history sidebar, injected into `player.svelte` as a children snippet.                                                                                                                                |

`deck-strip.svelte` loops all decks, splitting them into local and broadcast-listening groups. `+layout.svelte` separately loops compact deck IDs into `deck-compact-bar.svelte` at the layout bottom.

## `Deck` layout flags

Four booleans on the `Deck` type. `compact`/`expanded` are mutually exclusive. The other two are independent.

- `compact` — the `Deck` is rendered twice: `deck.svelte` in the strip shrinks to `width:0` (stays in DOM for audio), and `deck-compact-bar.svelte` appears at the layout bottom as the visible UI.
- `expanded` — `deck.svelte` goes `position:fixed; inset:0`. LayoutHeader hides. Force-clears `hide_video_player`.
- `hide_video_player` — video collapses to 0x0 via CSS. Audio keeps playing.
- `hide_queue_panel` — `display:none` on queue panel. Video fills freed space.

Deck ID 1 (the default) is hidden until it has queued tracks or an active track. Additional decks are always visible once created.

## Mobile layout behavior

On mobile (≤768px) a deck has two states: compact (bottom bar) or expanded (fullscreen) — the mini-bar/now-playing pattern. The in-strip state isn't reachable through interactions:

- Leaving compact (bar tap, expand button, `r` shortcut) goes through `expandDeck()` — fullscreen, and any other expanded deck returns to compact.
- Tapping anywhere on the compact bar expands; interactive controls inside (play, menu, links) still do their own thing.
- Mini-bar progress (≤1024px) is display-only, so tapping it on mobile opens the deck without seeking. Desktop bars retain seeking.
- The expanded deck shows a mobile-only chevron-down button (top-left) that collapses back to compact.
- New decks (`addDeck`) start compact on mobile.
- Persisted strip decks (neither flag, e.g. state saved on desktop) normalize to compact once at load in `+layout.svelte`. Resizing mid-session isn't fought — a desktop-created strip deck stays in the strip until the next interaction or reload.

Rendering details:

- Compact decks still render their hidden `deck.svelte` instance (for audio continuity), but collapse to zero height in the mobile strip.
- Visible compact controls live in the bottom compact section (`deck-compact-bar.svelte` in `+layout.svelte`).
- On compact decks, mobile view prioritizes channel micro cards (horizontal scroll, truncated slugs) and hides track row to keep controls usable.
