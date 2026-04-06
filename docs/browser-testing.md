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

Always re-snapshot after interactions. Always wait after `open` (first snapshot can return empty refs). Run `agent-browser --help` for all commands.

## Part 2: testing Radio4000

The app runs on http://localhost:5173 (dev) or https://radio4000.com (prod). Start the dev server (`bun dev`) before testing.

Verify setup:

```
agent-browser open http://localhost:5173
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

Wrap objects in `JSON.stringify()`.

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
