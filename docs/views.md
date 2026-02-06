# Views

Every track list is a query. Views make that query a first-class thing you can name, save, share, and pipe into anything.

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

## Goal

Views power any page that shows a track list — `/search`, `/mix`, and potentially more. Same query primitive, different UI.

## Files

- `src/lib/views.ts` — type, `parseView`, `serializeView`
- `src/lib/tanstack/collections/tracks.ts` — `queryKey` + `queryFn` for slug, tags, search
- `src/routes/_debug/views/+page.svelte` — debug playground
