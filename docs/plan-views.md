# Views

Every list of tracks in the app is already a query. The idea: make that query a first-class thing you can name, save, share, and pipe into anything.

## Current state

```ts
type View = {
	channels?: string[] // channel slugs
	tags?: string[] // match tracks with these tags
	tagsMode?: 'any' | 'all' // default 'any'
	search?: string // FTS globally, fuzzy locally
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
}
```

URL-encoded: `?search=miles+davis&tags=jazz&order=created&direction=desc&limit=50`

### Data path

All views render through `useLiveQuery` on `tracksCollection`. Loading and querying are separate:

- **With channels** → collection's built-in `queryFn` fetches by slug
- **Without channels** → `fetchTracksGlobal()` fetches from supabase, results `writeUpsert`'d into collection

Global fetch results are scoped by tracking returned IDs (`globalTrackIds`). The collection deduplicates by `track.id` — same track from two views = one entry. Tags/search post-filtered in JS (postgres array ops don't exist in TanStack DB query syntax).

### Files

- `src/lib/views.ts` — `View` type, `parseView`, `serializeView`
- `src/lib/tanstack/collections/tracks.ts` — `fetchTracksGlobal()`
- `src/routes/_debug/views/+page.svelte` — debug playground

## What's left

### Saved views (localStorage)

Users save a view with a name. Stored in a localStorage collection (same pattern as play-history). No `?view=` URL param — the full recipe is always in the URL. Saved views are just bookmarks with names.

### Views as inputs

A saved view can feed a /mix crate source, seed a new channel, etc.

## Non-goals (for now)

- Nested views (view-of-views)
- Exclude filters (NOT tag)
- Snapshot export — views are alive

## Prior art

- **Linear views** — saved filter/sort combos on issues
- **iTunes Smart Playlists** — rule-based, auto-updating playlists
- **Spotify Blend** — merges two users' tastes
- **Are.na channels** — composability ethos
