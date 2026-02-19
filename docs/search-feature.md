# Search

The `/search` page parses `?q=` into a [View](views.md) via `parseSearchQueryToView`, then uses `queryViewTracks` for reactive cached track results. Channel results run as separate queries alongside — slug lookup via `findChannelBySlug`, remote FTS via `searchChannels`, and local fuzzy via `searchChannelsLocal`.

## Query syntax

`@slug` scopes to channels, `#tag` filters by track tags, bare words become FTS. These combine: `@ko002 #jazz miles` searches for "miles" within ko002's tracks tagged jazz. Multiple mentions work: `@ko002 @oskar house`.

The URL is the single source of truth — `searchQuery` derives from `page.url.searchParams`.

## Search sources

FTS lives in `search-fts.js` — `buildFtsFilter` combines websearch and prefix syntax (`jazz house` → `jazz:* & house:*`). `searchChannels` and `searchTracks` hit Supabase with those filters.

`search.js` has the orchestration (`searchAll`) and local fuzzy search via fuzzysort (`searchTracksLocal`, `searchChannelsLocal`). `findChannelBySlug` checks the local collection first, falls back to SDK.

We don't use SDK's own `searchChannels`/`searchTracks` — they only do websearch (no partial-word matching). Our `buildFtsFilter` adds prefix mode for type-as-you-search. The `@slug`, `#tag`, channel-scoped search, and local fuzzy are also app-only.

The search page doesn't use `searchAll` directly — it composes the pieces itself: `queryViewTracks` for tracks, manual `$effect` for channels.

## Files

- `src/routes/search/+page.svelte` — page, input, results
- `src/lib/search-fts.js` — `buildFtsFilter`, `searchChannels`, `searchTracks`
- `src/lib/search.js` — `searchAll`, `findChannelBySlug`, `searchTracksLocal`, `searchChannelsLocal`

## Related

- [views.md](views.md) — the View pipeline that powers track results
