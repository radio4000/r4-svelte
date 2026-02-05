# Views

Every list of tracks in the app is already a query. The idea: make that query a first-class thing you can name, save, share, and pipe into anything.

## Current state

```ts
type View = {
	channels?: string[] // channel slugs
	tags?: string[] // match tracks with these tags
	tagsMode?: 'any' | 'all' // default 'any'
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
}
```

URL-encoded: `?channels=ko002,oskar&tags=jazz&tagsMode=all&order=created&direction=desc&limit=50`

### Two data paths

- **With channels** → `useLiveQuery` on `tracksCollection` (reactive, collection-backed)
- **Without channels** → `fetchTracksGlobal()` queries supabase directly (cached 60s via queryClient)

Global queries bypass the collection. This means duplicate track data across query cache entries (e.g. limit=5 and limit=6 share 5 tracks stored twice). Acceptable for now — short TTL, small payloads.

### Files

- `src/lib/views.ts` — `View` type, `parseView`, `serializeView`
- `src/lib/tanstack/collections/tracks.ts` — `fetchTracksGlobal()`
- `src/routes/_debug/views/+page.svelte` — debug playground

## What's left

### Saved views (localStorage)

Users save a view with a name. Stored in a localStorage collection (same pattern as play-history). No `?view=` URL param — the full recipe is always in the URL. Saved views are just bookmarks with names.

### Search

Reuse the inline track search pattern from the `[slug]` page.

### Views as inputs

A saved view can feed a /mix crate source, seed a new channel, etc.

### Unify data paths

Feed global query results into the collection via `writeUpsert`, so both paths deduplicate in memory. Would allow `useLiveQuery` for everything. Bigger refactor.

## Non-goals (for now)

- Nested views (view-of-views)
- Exclude filters (NOT tag)
- Snapshot export — views are alive

## Prior art

- **Linear views** — saved filter/sort combos on issues
- **iTunes Smart Playlists** — rule-based, auto-updating playlists
- **Spotify Blend** — merges two users' tastes
- **Are.na channels** — composability ethos
