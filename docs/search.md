# Search

The `/search` page parses `?q=` into a [View](views.md) via `parseSearchQueryToView`, then uses `queryViewTracks` for reactive cached track results. Channel results run as separate queries alongside — slug lookup via `findChannelBySlug`, remote FTS via `searchChannels`, and local fuzzy via `searchChannelsLocal`.

## Query syntax

`@slug` scopes to channels, `#tag` filters by track tags, bare words become FTS. These combine: `@ko002 #jazz miles` searches for "miles" within ko002's tracks tagged jazz. Multiple mentions work: `@ko002 @oskar house`.

Two URL modes: `?q=` (human query, debounced input) and raw params (`?channels=&tags=`). The `ViewsBar` switches to raw params mode. Both produce a `View` — `?q=` via `parseSearchQueryToView`, raw via `parseView`.

## Search sources

FTS lives in `search-fts.js` — `buildFtsFilter` combines websearch and prefix syntax (`jazz house` → `jazz:* & house:*`). `searchChannels` and `searchTracks` hit Supabase with those filters.

`search.js` has the orchestration (`searchAll`) and local fuzzy search via fuzzysort (`searchTracksLocal`, `searchChannelsLocal`). `findChannelBySlug` checks the local collection first, falls back to SDK.

We don't use SDK's own `searchChannels`/`searchTracks` — they only do websearch (no partial-word matching). Our `buildFtsFilter` adds prefix mode for type-as-you-search. The `@slug`, `#tag`, channel-scoped search, and local fuzzy are also app-only.

The search page doesn't use `searchAll` directly — it composes the pieces itself: `queryViewTracks` for tracks, manual `$effect` for channels. `ViewsBar` sits between the search input and results, providing saved view tabs and filter/display popovers.

## Files

- `src/routes/search/+page.svelte` — page, input, results
- `src/lib/search-fts.js` — `buildFtsFilter`, `searchChannels`, `searchTracks`
- `src/lib/search.js` — `searchAll`, `findChannelBySlug`, `searchTracksLocal`, `searchChannelsLocal`

## To be explored

The relationship between search, views, and queries. Three overlapping concepts:

- **`?q=`** — the smart query string. Human shorthand: `@slug` → channels, `#tag` → tags, bare words → FTS. Parsed by `parseSearchQueryToView` into a View.
- **`?channels=&tags=&search=`** — explicit view params. The canonical View format, written by ViewsBar.
- **`view.search`** — the FTS text field inside a View. Just one dimension alongside channels, tags, order, etc.

`?q=` is a superset — it encodes channels, tags, AND search in one string. Raw params spell them out separately. Both produce the same View. But they're two entry points to the same thing, which creates UX confusion:

- Two search inputs on `/search` (the main smart input + ViewsBar's Filters > Search field)
- `?q=` and raw params can coexist or conflict in the URL
- Saving a view from `?q=@ko002 dance` should store resolved params (`channels=ko002&search=dance`), not the `?q=` string

Open questions:
- Is `?q=` just a convenience shorthand that resolves into view params? Or is it a first-class alternative?
- Should the smart input live inside ViewsBar? One input, one query builder everywhere.
- If ViewsBar becomes the primary interface, does the smart query syntax (`@`, `#`) belong in ViewsBar's main input or only in the search field?
- On `/search`, should ViewsBar hide its own search field to avoid duplication?
- Could `/search` drop `?q=` entirely and always use raw params? The smart parser could still work — type `@ko002 dance`, it resolves and rewrites the URL to `?channels=ko002&search=dance`.

## Related

- [views.md](views.md) — the View pipeline that powers track results
