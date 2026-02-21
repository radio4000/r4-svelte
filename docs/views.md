# Views

Every track list is a query. Views make that query a first-class thing you can name, save, share, and pipe into anything. They power `/search`, `/_debug/views`, and potentially more. Same query primitive, different UI.

## View type

```ts
type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number // max 4000 (backend cap)
}
```

URL-encoded: `?channels=oskar&tags=jazz&order=created&direction=desc&limit=50`

## Query syntax

`parseSearchQueryToView` converts a human query string into a View. Used by `/search` and the debug quick-query input.

- `@slug` → `channels` (e.g. `@oskar @ko002`)
- `#tag` → `tags` (e.g. `#jazz #dub`)
- Everything else → `search` (free-text FTS)

Example: `@oskar #jazz miles` → `{channels: ['oskar'], tags: ['jazz'], search: 'miles'}`

Tags always refer to track tags, not channel tags. When channels and tags combine, channels are fetched first, then tracks are post-filtered by tags client-side.

## URL representations

Two routes expose Views with different URL shapes:

- **`/search?q=@oskar #jazz miles`** — stores the raw human query string. `parseSearchQueryToView` decodes it into a View, then `queryViewTracks` provides reactive cached track results. Channel resolution (`@slug` → channel cards) and FTS channel search run as separate `$effect`s alongside the view tracks query. The search page also accepts raw params (`/search?channels=oskar&tags=jazz`) — the `ViewsBar` switches to this mode when filters are applied directly.
- **`/_debug/views?channels=oskar&tags=jazz&search=miles`** — stores the already-parsed View as structured params. `parseView` reads it directly. Uses reactive TanStack queries (useLiveQuery / createQuery). Returns tracks only — channels are used as filters, not as results.

Both represent the same View — the `?q=` param is just the human-encoded form. The key difference: `/search` also shows channel cards alongside tracks, while the debug views page shows only tracks.

## Saving and pinning

A **View** is a stateless query recipe (`{channels, tags, order, ...}`). A **SavedView** gives it a name and persists it to localStorage: `{id, name, params, position?, description?, created_at}`. `params` is `serializeView(view).toString()`.

Pinning is a field, not a separate entity. A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears the position, `reorderPinnedViews(orderedIds)` updates sort weights. Clicking a pinned view navigates to `/@slug` for single-channel views, `/search?params` for everything else.

The collection uses `localStorageCollectionOptions` (same pattern as play-history).

## ViewsBar

Shared component on `/search` and `/_debug/views`. Props: `view`, `onchange(view)`. Active detection: `serializeView(view).toString() === sv.params`.

Three-state `mode`: **idle** (tabs + filter/display popovers), **adding** (clicked `+`, empty form to build a new view from scratch), **dirty** (changed filters after loading a saved view — shows a summary of active filters with "Save as" for a new view or "Update" to overwrite the base view).

## Data flow

Three query strategies, chosen by filter type:

- **Channels** — `useLiveQuery` with `.where(inArray(tracks.slug, channels))`. Works end-to-end because `inArray` on a string column filters correctly in-memory (Pattern 1 from tanstack.md).
- **Tags only** — `createQuery` reading from query cache. `useLiveQuery` can't be used because `inArray` on array columns checks equality, not containment — the fetch succeeds but the in-memory filter rejects the results. `createQuery` bypasses the collection's in-memory filter entirely.
- **Search only** — `createQuery` for the same reason: `eq` on tsvector columns doesn't work in-memory.
- **Channels + tags** — `useLiveQuery` fetches by slug, tags are post-filtered in `$derived` (Pattern 2 from tanstack.md).

All `createQuery` queryFns also `writeUpsert` into `tracksCollection` so the data is available for other queries.

Sort, direction, limit, tagsMode, and fuzzy search are all post-processing on the `tracks` derived. Cheap in-memory operations.

## Reactivity

Stable primitive strings from `page.url.searchParams.get(...)` drive the queries instead of the full `view` object. Since `parseView` returns a new object on every URL change, reading `view` directly would re-create the query on sort/direction/limit changes. Primitive strings use value equality so queries only re-create when channels, tags, or search actually change.

## Files

- `src/lib/views.svelte.ts` — `View` type, `parseView`, `serializeView`, `queryViewTracks`
- `src/lib/tanstack/collections/tracks.ts` — `queryKey` + `queryFn` for slug, tags, search
- `src/lib/tanstack/collections/views.ts` — `SavedView`, `viewsCollection`, CRUD + pin/unpin helpers
- `src/lib/components/views-bar.svelte` — `ViewsBar` component
- `src/lib/components/pins-nav.svelte` — renders pinned views in the sidebar
- `src/routes/_debug/views/+page.svelte` — debug playground
- `src/routes/settings/pins/+page.svelte` — pin management
