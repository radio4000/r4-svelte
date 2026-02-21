# Search

Search is typing into a box and getting results. Everything else — views, filters, saved queries — builds on top, but the core is: type words, see matching channels and tracks.

## Concepts

**Query** — what the user typed. A single string like `@ko002 #jazz miles`. The query is transient (lives in the input field and URL) and human-readable.

**View** — the structured recipe derived from a query: `{channels: ['ko002'], tags: ['jazz'], search: 'miles'}`. A View is what actually fetches data. It has no opinion about how it was created — from a typed query, from clicking filters, from a saved bookmark, or from a URL someone shared.

**`?q=`** — the URL encoding of a raw query string. A convenience for humans. `?q=@ko002 #jazz miles` is easier to type and share than `?channels=ko002&tags=jazz&search=miles`. It gets parsed into a View immediately — it's not stored, not saved, not canonical. Think of it as a one-way door: query string in, View out. On arrival, `?q=` resolves and the URL rewrites to view params.

One gotcha: `#` is the URL fragment separator. The browser splits `?q=@ko002 #jazz miles` into query `q=@ko002 ` and fragment `#jazz miles`. The `@` prefix survives because it's legal in query strings; `#` is not. We recombine `searchParams.get('q')` with `url.hash` before parsing. If the URL has no `#`, `url.hash` is empty and nothing changes.

**View params** — the URL encoding of a resolved View: `?channels=ko002&tags=jazz&search=miles`. This is the canonical format. ViewsBar reads and writes these. Saved views store these. Shared links should use these.

**The rule**: `?q=` is an entry point, view params are the format of record. When you type a query, it resolves into a View. When you interact with filters, they write view params directly. The two never coexist in the same URL.

## Query syntax

`@slug` targets a channel. `#tag` filters by track tag. Bare words become full-text search. They combine freely:

- `miles` — FTS for "miles" across all tracks
- `@ko002` — all tracks from ko002
- `#jazz` — all tracks tagged jazz
- `@ko002 #jazz miles` — tracks from ko002 tagged jazz matching "miles"
- `@ko002 @oskar house` — tracks from ko002 and oskar matching "house"

## Two kinds of results

A search returns **channels** and **tracks** as parallel result sets.

**Track results** go through the View pipeline — same system that powers `/_debug/views` and could power any filtered track list. One query, reactive, cached.

**Channel results** are their own thing. Three sources combined: exact slug lookup (`@ko002` finds the channel card), remote FTS (channels whose name/description matches), local fuzzy search (channels already in memory). These run as separate queries alongside the track results — they're not part of the View.

This split is intentional. Views are about tracks. Channel discovery is a search-page feature that sits next to the view, not inside it.

## FTS details

We don't use the SDK's built-in search — it only does websearch-style matching (whole words). We build our own FTS filter that adds prefix matching: `jazz house` becomes `jazz:* & house:*`. This gives type-as-you-search behavior. The `@slug`, `#tag`, channel-scoped search, and local fuzzy are also app-only features.

## The search page

The page has two UI layers:

1. **Smart input** — a text field at the top. You type a query, it debounces, resolves `@`/`#` syntax, and writes view params to the URL. No `?q=` in the URL during normal use — the input resolves directly to canonical params.
2. **ViewsBar** — sits below the input. Shows saved view tabs, filter/display controls. Reads and writes view params directly.

Both write the same URL format. The smart input is the fast path (type and go). ViewsBar is the structured path (click to build). When ViewsBar changes something, the smart input clears — you're working with explicit filters now.

## Open questions

- Should the smart input live _inside_ ViewsBar? One input, one place, smart syntax always available. This would eliminate the two-input confusion.
- Does the smart syntax (`@`, `#`) belong everywhere ViewsBar appears, or only on `/search`?

## Files

- `src/routes/search/+page.svelte` — resolves `?q=` on arrival, rewrites to canonical view params
- `src/lib/search-fts.js` — `buildFtsFilter`, `searchChannels`, `searchTracks`
- `src/lib/search.js` — `searchAll`, `findChannelBySlug`, `searchTracksLocal`, `searchChannelsLocal`
- See also [views.md](views.md) — the View pipeline that powers track results
