# Search

Search pages share one input grammar but two result engines:

- Track results go through the [View pipeline](views.md): `queryView(view)` sends searches across channels to the database (`sdk.search.searchTracks`) and filters a single channel's loaded tracks locally.
- Channel results run separately via `searchChannelsCombined()` in `search.js`: slug lookup + remote FTS + local fuzzy, deduplicated by ID. Not part of the View — channel cards are a search-page feature.

## Query syntax

`@slug` targets a channel. `#tag` filters by track tag. `mention:@slug` finds tracks whose description mentions that channel. Bare words become full-text search. Every part narrows the result, and they combine freely:

- `miles` — FTS for "miles" across all tracks
- `@ko002` — all tracks from ko002
- `#jazz` — all tracks tagged jazz
- `@ko002 #jazz miles` — tracks from ko002 tagged jazz matching "miles"
- `@ko002 @oskar house` — tracks from ko002 and oskar matching "house"
- `#techno #acid` — tracks tagged both techno and acid
- `mention:@ko002 #house` — tracks from any channel tagged house that mention ko002

`parseView` (from `views.ts`) parses a query string into a [View](views.md), reading each source with the sdk's `parseQuery`, so the site and `r4 search` understand a query the same way. Tags are read with the database's rule, so `#Techno,` is `techno`. The View drives track results. The first source's `@slug` mentions and `search` text also feed into `searchChannelsCombined` for channel cards.

## URL format (SearchURL)

Page URLs use the `SearchURL` format: human query text in `?q=`, display options as sibling params (`/search?q=@ko002 #jazz miles&order=created`). Not the same as a `ViewURI` — see [two serializations](views.md#two-serializations).

`SearchUrl` (from `search-url.svelte.js`) syncs the text input to the page URL. It debounces input, runs `parseView(q)` → `viewToUrl()`, and writes the URL. On load, `viewFromUrl(page.url)` reconstructs the View. The debounced sync only writes non-empty queries — clearing the input doesn't update the URL until submit.

## The search page

Two input paths write the same `?q=` URL: the smart input (text field, via `SearchUrl`) and the `ViewsBar` (saved view tabs, filter/display controls, via `viewToUrl`/`viewFromUrl`). They stay in sync — `ViewsBar` changes call `seedInput`, and smart input changes flow to `ViewsBar` through the URL.

Dedicated routes are projections of the same search language, trimmed to one result engine:

- `/search` — mixed results: View-backed tracks + channel discovery
- `/search/tracks` — View-backed track results only (same `@channel`, `#tag`, free-text syntax)
- `/search/channels` — channel discovery only (plain text + `@slug` mentions)

## Where matching happens

Searches across channels are one database query: channel slugs, every tag, the mention and the text all narrow it, and the database orders, pages and counts. A single channel's tracks are already loaded, so that case filters locally instead. See [query strategies](views.md#query-strategies).

## FTS details

The sdk's full-text filter combines websearch matching (`jazz or funk`, `-techno`, `"exact phrase"`) with prefix matching: `jazz hou` also becomes `jazz:* & hou:*`, so results appear as you type.

## Files

- `src/lib/search-url.svelte.js` — `SearchUrl` class: debounced input ↔ URL sync for all search routes
- `src/routes/search/+page.svelte` — combined search (channels + tracks)
- `src/routes/search/tracks/+page.svelte` — tracks only
- `src/routes/search/channels/+page.svelte` — channels only
- `@radio4000/sdk` `search` — `parseQuery`, `searchTracks`, `searchChannels`
- `src/lib/search.js` — `searchChannelsCombined`, `findChannelBySlug`
- `src/lib/components/search-input.svelte` — the smart input component
- See also [views.md](views.md) — the View pipeline that powers track results
