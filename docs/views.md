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
	limit?: number
}
```

URL-encoded: `?channels=oskar&tags=jazz&order=created&direction=desc&limit=50`

## Data flow

All views render through `useLiveQuery` on `tracksCollection`. The `.where()` clause drives the collection's `queryFn` to fetch the right data from Supabase.

Channel queries work end-to-end because `inArray` on a string column filters correctly in-memory. Tag and search queries hit a TanStack DB limitation: `inArray` on array columns checks equality, not containment, and `eq` on tsvector columns doesn't work in-memory either. So the `.where()` successfully drives the fetch, but the in-memory filter rejects the results. For these cases the views page reads the query cache directly via `queryClient.getQueryData()`.

Sort, direction, limit, tagsMode, and fuzzy search are all post-processing on the `tracks` derived. Cheap in-memory operations.

## Reactivity

The `useLiveQuery` callback reads stable primitive strings from `page.url.searchParams.get(...)` instead of the full `view` object. Since `parseView` returns a new object on every URL change, reading `view` directly would re-create the collection on sort/direction/limit changes. Primitive strings use value equality so the collection only re-creates when channels, tags, or search actually change. Same pattern as `[slug]/+layout` where `slug` is a primitive derived.

## Files

- `src/lib/views.ts` — type, `parseView`, `serializeView`
- `src/lib/tanstack/collections/tracks.ts` — `queryKey` + `queryFn` for slug, tags, search
- `src/routes/_debug/views/+page.svelte` — debug playground
