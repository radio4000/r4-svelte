# Plan: make deck header deck-specific

## The problem

`DeckChannelHeader` is one component used in two conceptually different contexts:

1. Channel page (`src/routes/[slug]/+layout.svelte`) -- shows channel identity: name, slug, tags
2. Deck (both `player.svelte` and `deck-compact-bar.svelte`) -- shows what a deck is doing: playing @slug, listening to @someone, auto-radio state, broadcast sync

These answer different questions:

- Channel page: "who is this?"
- Deck header: "what is this deck doing right now?"

A shared builder function `buildDeckChannelHeaderState` in `deck-channel-header-shared.js` adapts both contexts into the same shape. The channel page has no real deck, so it synthesizes deck-like state just to feed the builder. The shared fiction is the root problem.

## Current architecture

```
caller (layout/player/compact-bar)
  -> buildDeckChannelHeaderState(input)  -- shared builder
  -> spreads ~7 fields as individual props
  -> <DeckChannelHeader ...15 props />   -- shared component
```

The component accepts ~15 flat props. The builder does slug-to-href mapping, hashtag extraction, listening who/whom resolution, and optional `toHref` for embed mode (used by deck surfaces, not by channel page).

## Files involved

- `src/lib/components/deck-channel-header.svelte` -- the shared component
- `src/lib/components/deck-channel-header-shared.js` -- builder + helpers
- `src/routes/[slug]/+layout.svelte` -- channel page caller (lines ~210-238)
- `src/lib/components/player.svelte` -- deck caller (lines ~156-168, ~429-464)
- `src/lib/components/deck-compact-bar.svelte` -- compact deck caller (lines ~61-73, ~132-159)

## What we know

Three layers, each honest about what it is:

1. Deck (persisted) -- `playlist_slug`, `playlist_title`, `listening_to_channel_id`, `auto_radio`, etc. Behavior and state. Already correct in `types.ts`. Do not add UI fields here.

2. Deck header state (derived) -- a view model built from deck + channelsCollection + tracksCollection + resolve/embed context. Produces title, slugHref, resolved listening slugs, tag links, isBroadcasting, etc. Lives near the deck feature, not in the Deck type.

3. Deck header component (presentation) -- takes that derived shape, renders it. Deck-only. No pretense of generality.

Useful boundary to keep: canonical data in, presentational projection out. But do not copy the breadth of `channel-ui-state.js` or turn this into another catch-all UI-state blob.

## What the deck header needs (same shape for player and compact-bar)

From the builder (derived from deck + collections):

- title, slug, slugHref
- listeningWhoSlug/Href, listeningWhomSlug/Href
- tags (from playlist_title)
- toHref/embed-mode logic (deck-surface concern)

Runtime state (also derived, from deck + app state):

- isPlaying, isBroadcasting
- showAutoButton, autoGhost, autoTitle, onAutoClick
- showBroadcastSync, broadcastSyncDrifted, broadcastSyncTitle, onBroadcastSyncClick
- presenceCount
- titleElement, titleClass (optional display overrides with defaults)

Both deck consumers already pass identical builder input. The only differences are optional display overrides (titleElement/titleClass in player, presenceCount in player) -- all have sensible defaults.

## What the channel page needs (lower priority, later)

- Channel name as title (h1), slug link, tags
- Listening who/whom + broadcast sync (when tuned)
- Does NOT need: auto-radio, isBroadcasting, presence count, toHref/embed logic
- Currently synthesizes a fake deck just to feed the shared builder -- that goes away

## Direction

Kill the shared builder fiction. Make the deck path honest first:

- A deck-only derivation function (like `deriveChannelActivityState` but for deck header display)
- A deck-only header component that takes the derived shape
- The channel page stops pretending it has a deck -- separate and simpler, handled later

The builder's helpers (`extractPlaylistHashtags`, `buildTagHref`, `getListeningWhomSlug`) are useful regardless -- they stay as shared utilities.

## Caution: do not create another `channel-ui-state.js`

There is already a broad projection layer in `channel-ui-state.js`.

That file is load-bearing and reused in multiple places, but it is also a warning:

- too broad
- too UI-shaped
- too easy to turn into a dumping ground

For deck header state, keep the scope narrow:

- one feature
- one projection
- one component family

## Decisions for now

- Deck header derivation lives next to the component:
  - `deck-header-state.js` alongside `deck-header.svelte`
- The existing shared file shrinks to reusable helpers only:
  - `extractPlaylistHashtags`
  - `buildTagHref`
  - `getListeningWhomSlug`
- The header component takes one `state` object prop
  - that keeps the "derived view model" idea intact
  - it avoids spreading the concept back into 15 flat props
- `toHref` / embed-mode rewriting happens in the derivation
  - producing the final hrefs is part of building header state
- Shared presentational bits stay duplicated for now
  - two consumers is not enough to justify extra abstraction
  - extract only if a third consumer appears or the markup grows

## Still open

- What is the simplest channel-page header once deck concerns are removed?
