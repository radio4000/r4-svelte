# Search

Type words, see matching channels and tracks. The query syntax, View pipeline, and FTS all serve that loop.

## Query syntax

`@slug` targets a channel. `#tag` filters by track tag. Bare words become full-text search. They combine freely:

- `miles` — FTS for "miles" across all tracks
- `@ko002` — all tracks from ko002
- `#jazz` — all tracks tagged jazz
- `@ko002 #jazz miles` — tracks from ko002 tagged jazz matching "miles"
- `@ko002 @oskar house` — tracks from ko002 and oskar matching "house"

`parseSearchQueryToView` parses a query string into a [View](views.md). The View is what actually fetches data.

## URL format

The URL `?q=@ko002 #jazz miles` is a human-friendly entry point. On arrival, the search page resolves it into canonical view params (`?channels=ko002&tags=jazz&search=miles`) and rewrites the URL. The `?q=` form is never stored or saved — it's a one-way door.

One gotcha: `#` is the URL fragment separator. The browser splits `?q=@ko002 #jazz` into query `q=@ko002 ` and fragment `#jazz`. The page recombines `searchParams.get('q')` with `url.hash` before parsing.

View params are the format of record. ViewsBar reads and writes them. Saved views store them. Shared links should use them.

## Results

A search returns **channels** and **tracks** as parallel result sets.

Track results go through the [View pipeline](views.md) — same `queryView` that powers `/_debug/views`.

Channel results run separately via `searchChannelsCombined({slugs, query, localChannels})`: exact slug lookup (`@ko002` finds the channel card), remote FTS (channels whose name/description matches), and local fuzzy search (channels already in memory). Results are deduplicated by ID. These are not part of the View — they're a search-page feature.

## The search page

Two input paths that write the same URL format:

1. **Smart input** — text field at the top. Debounces, resolves `@`/`#` syntax, writes view params to the URL.
2. **ViewsBar** — below the input. Saved view tabs, filter/display controls. Reads and writes view params directly.

When ViewsBar changes something, the smart input syncs to reflect the current view. When the smart input resolves a query, ViewsBar picks it up from the URL.

Dedicated routes keep the same search model, trimmed to one result type:

- `/search/channels` searches channels only. It accepts plain text and exact `@slug` mentions.
- `/search/tracks` searches tracks only and still accepts the same `@channel`, `#tag`, and free-text view syntax as `/search`.

## FTS details

We don't use the SDK's built-in search — it only does websearch-style matching (whole words). `buildFtsFilter` adds prefix matching: `jazz house` becomes `jazz:* & house:*`, giving type-as-you-search behavior.

## Files

- `src/routes/search/+page.svelte` — resolves `?q=` on arrival, wires up both input paths
- `src/lib/search-fts.js` — `buildFtsFilter`, `searchChannels`, `searchTracks`
- `src/lib/search.js` — `searchAll`, `findChannelBySlug`, `searchChannelsCombined`, `fuzzySearch`, `searchChannelsLocal`, `searchTracksLocal`
- `src/lib/components/search-input.svelte` — the smart input component
- See also [views.md](views.md) — the View pipeline that powers track results
