# Views

Views describe what tracks to show and how. A reusable pattern across URL params, filter/display UI, search and data loading. Views are private by design, sharable by nature.

## Types

```ts
/** What to fetch — a query for tracks. */
type ViewQuery = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}

/** One or more queries merged, with display options. */
type View = {
	queries: ViewQuery[]
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	exclude?: string[]
}

/** A serialized View as a compact string. Branded type — only produced by serializeView/viewURI. */
type ViewURI = string & {readonly __brand: 'ViewURI'}
```

`ViewQuery` is what to fetch. `View` combines one or more queries with how to display the result. `ViewURI` is the serialized compact string form — a branded type so TypeScript prevents passing arbitrary strings where a serialized view is expected.

A single-query view: `{queries: [{channels: ['ko002'], tags: ['jazz']}], order: 'created'}`.

## Human query syntax

- `@slug` → `channels` (e.g. `@oskar @ko002`)
- `#tag` → `tags` (e.g. `#jazz #dub`)
- Everything else → `search` (free-text FTS)

Tags always refer to track tags, not channel tags. When channels and tags combine, channels are fetched first, then tracks are post-filtered by tags client-side.

## API

### Query level

```ts
parseQuery('@ko002 #jazz hello')
// → {channels: ['ko002'], tags: ['jazz'], search: 'hello'}

serializeQuery({channels: ['ko002'], tags: ['jazz'], search: 'hello'})
// → '@ko002 #jazz hello'
```

### View level

Multiple queries separated by `;`, options after `?`. The `r4://` prefix is optional (stripped if present).

```ts
parseView('@alice #jazz;@bob #techno?order=shuffle')
// → {queries: [{channels:['alice'], tags:['jazz']}, {channels:['bob'], tags:['techno']}], order:'shuffle'}

parseView('@ko002 #jazz')
// → {queries: [{channels: ['ko002'], tags: ['jazz']}]}

parseView('r4://@alice #jazz;@bob #techno?order=shuffle')
// → same as without prefix

serializeView({
	queries: [
		{channels: ['alice'], tags: ['jazz']},
		{channels: ['bob'], tags: ['techno']}
	],
	order: 'shuffle'
})
// → '@alice #jazz;@bob #techno?order=shuffle'
```

### Utilities

```ts
viewFromUrl(url) // extract a View from a URL (decodes search string, passes to parseView)
viewLabel(view) // all queries as a human string, no options (for labels/display)
normalizeView(view) // strip empty fields so equivalent views compare equal
viewURI(view) // canonical string: serializeView(normalizeView(view))
```

### Summary

| Function         | Input → Output        | Use                                   |
| ---------------- | --------------------- | ------------------------------------- |
| `parseQuery`     | `string → ViewQuery`  | Human query string to query object    |
| `serializeQuery` | `ViewQuery → ViewURI` | Query object to human string          |
| `parseView`      | `string → View`       | Full view string (`;` and `?options`) |
| `serializeView`  | `View → ViewURI`      | View to compact string                |
| `viewFromUrl`    | `URL → View`          | Decode URL search → `parseView`       |
| `viewLabel`      | `View → string`       | All queries as human string (labels)  |
| `normalizeView`  | `View → View`         | Strip empties for comparison          |
| `viewURI`        | `View → ViewURI`      | Canonical string for comparison/seed  |

## Two contexts

**Page URLs** — flat, one query, options as separate URL params:

```
/explore?q=@alice #jazz piano&order=shuffle&limit=50
```

The page reads `q` → `parseQuery`, reads `order`/`direction`/`limit` individually, assembles a `View`.

**Compact string** — storage (SavedView), broadcast, sharing:

```
@alice #jazz;@bob #techno?order=shuffle
```

`parseView` / `serializeView` handles the whole thing. The `r4://` prefix is for external contexts (clipboard, links) — the parser doesn't require it.

## Options

After `?`, global to all queries:

| Key         | Values                                            | Default   | Meaning                                         |
| ----------- | ------------------------------------------------- | --------- | ----------------------------------------------- |
| `order`     | `created`, `updated`, `name`, `tracks`, `shuffle` | `created` | Sort applied to merged result                   |
| `direction` | `asc`, `desc`                                     | `desc`    | Sort direction                                  |
| `limit`     | 1–4000                                            | none      | Max tracks after merge                          |
| `tagsMode`  | `any`, `all`                                      | `any`     | Tag match for queries without explicit override |
| `exclude`   | comma-separated track UUIDs                       | none      | Skip these track IDs                            |

## Examples

```
@ko002
@ko002 #jazz
@ko002 #jazz miles davis?order=created&direction=asc&limit=50
#jazz #dub?tagsMode=all
?order=shuffle&limit=50

@alice #jazz;@bob #techno,house;@coco miles davis
@alice;@bob;@coco?order=shuffle&limit=100
@ko002?exclude=uuid-1,uuid-2,uuid-3
@ko002 #jazz;@oskar #dub?exclude=uuid-1,uuid-2
```

## Saving and pinning

A **View** is a stateless query recipe. A **SavedView** gives it a name and persists it to localStorage: `{id, name, uri, position?, description?, created_at}`. `uri` is `serializeView(view)` — the compact string form.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears the position, `reorderPinnedViews(orderedIds)` updates sort weights.

## ViewsBar

Shared component on `/explore` and `/_debug/views`. Props: `view`, `onchange(view)`. Active detection: `serializeView(view) === sv.uri`.

Three-state `mode`: **idle** (tabs + filter/display popovers), **adding** (clicked `+`, empty form to build a new view from scratch), **dirty** (changed filters after loading a saved view — shows a summary of active filters with "Save as" for a new view or "Update" to overwrite the base view).

## Processing

`processViewTracks(tracks, view)` applies post-processing to raw tracks: tag filtering (respects `tagsMode`), fuzzy search on title/description, sort by order/direction, shuffle, and limit. `queryView` uses it internally, but it can also be used standalone for in-memory filtering.

## Files

- `src/lib/views.ts` — `ViewQuery`, `View` types, pure helpers (`parseQuery`, `serializeQuery`, `parseView`, `serializeView`, `normalizeView`, `viewURI`)
- `src/lib/views.svelte.ts` — `processViewTracks`, `queryView`, `getAutoDecksForView` (reactive, Svelte-dependent)
- `src/lib/collections/views.ts` — `SavedView`, `viewsCollection`, CRUD + pin/unpin helpers
- `src/lib/components/views-bar.svelte` — `ViewsBar` component
- `src/lib/components/pins-nav.svelte` — renders pinned views in the sidebar
- `src/routes/_debug/views/+page.svelte` — debug playground
- `src/routes/settings/pins/+page.svelte` — pin management
