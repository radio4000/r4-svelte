# Browser testing

## Part 1: agent-browser

`agent-browser` is a CLI for browser automation. It returns LLM-optimized snapshots with element refs (@e1, @e2...) instead of raw HTML.

Core loop:

```
agent-browser open <url>
agent-browser wait 1000
agent-browser snapshot -i          # interactive elements with refs
agent-browser click @e1            # interact by ref
agent-browser fill @e2 "text"
agent-browser snapshot -i          # re-snapshot — refs change between snapshots
```

Useful commands:

- `snapshot -s "main article"` — scope to a CSS selector
- `snapshot -i -d 2` — limit depth for overview
- `get url` — check current URL without a full snapshot
- `errors` — check for JS errors
- `eval "expression"` — run JS in the page
- `scrollintoview @ref` — scroll before clicking off-screen elements (clicks can silently fail otherwise)
- `diff snapshot` — compare before/after snapshots to verify an interaction changed something

Always re-snapshot after interactions. Always wait after `open` (first snapshot can return empty refs). Go one step at a time; when something hangs, probe the page (`eval "location.href"`) before rerunning anything bigger. Run `agent-browser --help` for all commands.

## Part 2: testing Radio4000

Pick a URL from [testing](testing.md). Use `--session r4` for the logged-in profile (login in AGENTS.local.md). `r4-bench` belongs to the benchmark; don't drive it by hand while one runs.

Verify setup:

```
agent-browser open https://r4.localhost
agent-browser wait 1000
agent-browser snapshot
```

If the snapshot shows the homepage, you're ready.

### Internal state

The app exposes `window.r5` in the browser console. Cross-check UI against internal state:

```
agent-browser eval "JSON.stringify(window.r5.appState)"
```

| Expression                                 | Returns                                        |
| ------------------------------------------ | ---------------------------------------------- |
| `window.r5.appState`                       | reactive UI state (decks, user, display prefs) |
| `window.r5.appState.channels_order`        | current channel sort field                     |
| `window.r5.appState.channels_display`      | "grid" or "list"                               |
| `window.r5.sdk`                            | Supabase SDK instance                          |
| `window.r5.channelsCollection._state.size` | channels loaded                                |
| `window.r5.tracksCollection._state.size`   | tracks loaded                                  |
| `window.r5.api`                            | every `api.ts` function — drive logic directly |
| `window.r5.decks()`                        | deck probe — see "Player & decks" below        |

Wrap objects in `JSON.stringify()`.

`window.r5.api` lets you trigger app logic without clicking — e.g.
`eval "window.r5.api.toggleChannelPlay({id, slug:'oskar'})"`. Faster and less
flaky than driving the player through the UI.

### Player & decks

The player runs N decks (`appState.decks`, keyed by id) with one `active_deck_id`.
Multiple decks can play at once — there is no exclusive-playback rule.

**Assert on resolution, not playback.** Muted/backgrounded YouTube (and SoundCloud)
iframes **self-pause in headless Chromium**, especially across navigations — so
`is_playing` reads flaky and is _not_ reliable ground truth. What _is_
deterministic: which deck is `active_deck_id` and what slug each deck holds. Test
those. "Tap play on channel X resolves to and focuses the deck holding X" is a
resolution fact the headless audio state can't break.

Probe decks in one call:

```
agent-browser eval "JSON.stringify(window.r5.decks())"
# → [{id, slug, playing, active, auto}, ...]
```

**Two-deck setup** (the arrangement that catches display-vs-action bugs — a deck
acting on a channel other than the active one):

```
agent-browser eval "window.r5.api.playChannelInNewDeck({id:'<id-a>', slug:'channel-a'})"
agent-browser eval "window.r5.api.playChannelInNewDeck({id:'<id-b>', slug:'channel-b'})"
# channel-b's deck is now active; channel-a's deck is loaded but not active.
# Tapping channel-a's play control should resolve to channel-a's deck — assert
# active flips to it via window.r5.decks(), not that audio resumed.
```

Keep decks muted while testing: `eval "Object.values(window.r5.appState.decks).forEach(d => d.muted = true)"`.

### UI patterns

Some controls hide behind `<details>` widgets — click them open before their contents appear in snapshots:

- Channel page "Info" button: expands menu with Info, Tracks, Tags, Mentions, Following, Followers
- /channels display button: expands display options (Grid, List, Map, Tuner, Infinite), sort order, shuffle
- /channels filter button: expands filter presets (Featured, 10+ tracks, 100+ tracks, 1000+ tracks, All, Has artwork)

### What to test

Test areas, roughly by importance. Design your own checks — open pages, click around, verify things make sense. Not every area needs testing every time; pick what's relevant.

- Navigation: app shell links, menu, explore page, 404 handling, back/forward
- Channels directory (/channels): filters, sort, display modes (grid/list/map), pagination
- Channel page (/@slug): info section, track list, tags, followers, following
- Search: queries return results, channel+track results, tag search, empty states
- Player: play a channel, play/pause, next/prev, queue, deck controls
- Auth flows: sign in/out, protected routes redirect properly
- Responsive: test at mobile and desktop widths

### Scoring

Inspired by [darwin-derby](https://github.com/kousun12/darwin-derby) — every test run collapses into a single number. That number is a ratchet: it should only go up. If it drops, something regressed.

Score each area 0-10, then weight by importance:

| Area         | Weight | Score | Weighted |
| ------------ | ------ | ----- | -------- |
| Navigation   | x2     | /10   | /20      |
| Channels     | x2     | /10   | /20      |
| Channel page | x2     | /10   | /20      |
| Search       | x1     | /10   | /10      |
| Player       | x2     | /10   | /20      |
| Auth         | x1     | /10   | /10      |
| Total        |        |       | /100     |

0 = completely broken, 5 = works but has issues, 10 = solid.

The weights encode what matters most — navigation, channels, channel pages, and player are core experiences so they count double. Adjust weights as priorities shift.

### Reporting

For individual checks, one line each:

```
PASS  channel page loads tracks
FAIL  search empty state — expected "no results" message, got blank page
```

End with the score table, the total, and a summary of failures with relevant snapshot fragments or console output. Compare against previous scores when available — the total should only move forward.
