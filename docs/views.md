# Views

"Views" _describe_ tracks and channels, and how to display them.

Start with a ViewURI string or page URL. `parseView(uri)` or `viewFromUrl(url)` gives you a `View`. Fetch its data with `queryView(view)`.

Going the other way, `serializeView(view)` turns a View back into a ViewURI. `viewLabel(view)` for display, `viewURI(view)` for comparison and storage.

```ts
type ViewURI = string & {readonly __brand: 'ViewURI'}
type ViewSource = {channels?; tags?; tagsMode?; search?}
type View = {sources: ViewSource[]; order?; direction?; limit?; offset?; exclude?}
```

For more, see lib/views.ts, lib/views.svelte.ts, lib/collections/views.ts.

---

## What is a ViewURI?

A string using @mentions, #hashtags, and free text for search (server-side FTS + client-side fuzzy).
Sources are optionally separated by `;`. Options follow `?`.
Tags always refer to track tags, not channel tags.
The `r4://` prefix is optional.

```
@ko002
r4://@ko002 #jazz
@ko002 #jazz miles davis?order=created&direction=asc&limit=50
#jazz #dub?tagsMode=all
@alice @bob?limit=5
@alice #jazz;@bob #techno;@coco miles davis
@alice;@bob;@coco?order=shuffle&limit=100
?exclude=uuid-1,uuid-2,uuid-3
```

## Options

After `?`, global to all sources:

- `order` — `created` (default), `updated`, `name`, `tracks`, `shuffle`
- `direction` — `asc`, `desc` (default)
- `limit` — 1–4000
- `offset` — ≥ 0, pairs with `limit`
- `tagsMode` — `any` (default), `all`
- `exclude` — comma-separated track UUIDs

## Saving and pinning views

A **SavedView** gives a View a name and persists it to localStorage: `{id, name, uri, position?, description?, created_at}`. `uri` is `serializeView(view)`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears it, `reorderPinnedViews(orderedIds)` updates sort weights.
