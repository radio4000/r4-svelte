# Search

Search pages share one input grammar but two result engines:

- **Track results** go through the [View pipeline](views.md): `queryView(view)` handles channel scoping, tag filtering, FTS, fuzzy post-filter, and sort/pagination.
- **Channel results** run separately via `searchChannelsCombined()` in `search.js`: slug lookup + remote FTS + local fuzzy, deduplicated by ID. Not part of the View — channel cards are a search-page feature.

## Query syntax

`@slug` targets a channel. `#tag` filters by track tag. Bare words become full-text search. They combine freely:

- `miles` — FTS for "miles" across all tracks
- `@ko002` — all tracks from ko002
- `#jazz` — all tracks tagged jazz
- `@ko002 #jazz miles` — tracks from ko002 tagged jazz matching "miles"
- `@ko002 @oskar house` — tracks from ko002 and oskar matching "house"

`parseView` (from `views.ts`) parses a query string into a [View](views.md). The View drives track results. The first source's `@slug` mentions and `search` text also feed into `searchChannelsCombined` for channel cards.

## URL format (SearchURL)

Page URLs use the **SearchURL** format: human query text in `?q=`, display options as sibling params (`/search?q=@ko002 #jazz miles&order=created`). This is not the same as a **ViewURI** — see [two serializations](views.md#two-serializations). Both formats preserve all View fields.

`SearchUrl` (from `search-url.svelte.js`) syncs the text input to the page URL. It debounces input, runs `parseView(q)` → `viewToUrl()`, and writes the URL. On load, `viewFromUrl(page.url)` reconstructs the View. The debounced sync only writes non-empty queries — clearing the input doesn't update the URL until submit.

## The search page

Two input paths write the same `?q=` URL: the **smart input** (text field, via `SearchUrl`) and the **ViewsBar** (saved view tabs, filter/display controls, via `viewToUrl`/`viewFromUrl`). They stay in sync — ViewsBar changes call `seedInput`, and smart input changes flow to ViewsBar through the URL.

Dedicated routes are projections of the same search language, trimmed to one result engine:

- `/search` — mixed results: View-backed tracks + channel discovery
- `/search/tracks` — View-backed track results only (same `@channel`, `#tag`, free-text syntax)
- `/search/channels` — channel discovery only (plain text + `@slug` mentions)

## Two-stage fetch and refine

Track results use a broad-then-narrow approach: fetch broadly (FTS, Supabase overlaps, or channel dump), then refine locally with `processViewTracks` (tag post-filtering for `tagsMode=all`, fuzzy search, sort/shuffle). See [query strategies](views.md#query-strategies) for which stage does what per strategy.

## FTS details

We don't use the SDK's built-in search — it only does websearch-style matching (whole words). `buildFtsFilter` adds prefix matching: `jazz house` becomes `jazz:* & house:*`, giving type-as-you-search behavior.

## Files

- `src/lib/search-url.svelte.js` — `SearchUrl` class: debounced input ↔ URL sync for all search routes
- `src/routes/search/+page.svelte` — combined search (channels + tracks)
- `src/routes/search/tracks/+page.svelte` — tracks only
- `src/routes/search/channels/+page.svelte` — channels only
- `src/lib/search-fts.js` — `buildFtsFilter`, `searchChannels`, `searchTracks`
- `src/lib/search.js` — `searchChannelsCombined`, `findChannelBySlug`
- `src/lib/components/search-input.svelte` — the smart input component
- See also [views.md](views.md) — the View pipeline that powers track results
