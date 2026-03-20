# Views

Views are track-centric: they describe which tracks to include, from which channels, and how to display them. Channel cards on `/search` are outside the View pipeline — those come from `searchChannelsCombined()` ([search.md](search.md)).

The pipeline: query text → `parseView()` → `View` → `queryView()` → tracks. Inspect it live at `/_debug/views`, which shows the parsed View JSON and queryView result.

```ts
type ViewURI = string & {readonly __brand: 'ViewURI'}
type ViewSource = {channels?; tags?; tagsMode?; search?}
type View = {sources: ViewSource[]; order?; direction?; limit?; offset?}
```

A View has two conceptual halves: **query** (sources — what to fetch) and **display** (order, direction, limit, offset — how to show it). They live in one flat object at runtime, but the distinction matters for serialization and strategy selection.

## Two serializations

A View has two string forms with distinct jobs:

**ViewURI** (`serializeView(view)`) — lossless identity for storage and comparison. Preserves all fields including `tagsMode`. Saved views store this in their `uri` field. `viewURI(view)` normalizes first, for equality checks.

**SearchURL** (`viewToUrl(basePath, view)`) — human-readable page URL for navigation. The query text goes in `?q=`, and display options (`order`, `direction`, `limit`, `offset`, `tagsMode`) become sibling URL params. `viewFromUrl(url)` reads this format back.

Both formats are now lossless for all supported View fields. The difference is structural: ViewURI is a single compact string (`@ko002 #jazz?order=shuffle&tagsMode=all`), SearchURL splits query from options across URL params (`?q=@ko002 #jazz&order=shuffle&tagsMode=all`).

Example: `/search?q=@ko002 #jazz&order=created`

`viewLabel(view)` returns the human query text (sources only, no options) — this is what goes into `?q=`.

For more, see lib/views.ts, lib/views.svelte.ts, lib/search-url.svelte.js, lib/collections/views.ts.

---

## What is a ViewURI?

A string using @mentions, #hashtags, and free text for search (server-side FTS + client-side fuzzy). Options follow `?`. Tags always refer to track tags, not channel tags. The `r4://` prefix is optional.

**Multi-source (experimental):** The parser and ViewsBar support `;`-separated multi-source Views (e.g. `@alice #jazz;@bob #techno`). Parse/serialize/normalize handle multiple sources correctly, but the runtime query path (`queryView`, `resolveViewStrategy`, all search routes) reads only `sources[0]`. Multi-source is not yet wired at query time.

```
@ko002
r4://@ko002 #jazz
@ko002 #jazz miles davis?order=created&direction=asc&limit=50
#jazz #dub?tagsMode=all
@alice @bob?limit=5
@alice #jazz;@bob #techno;@coco miles davis
@alice;@bob;@coco?order=shuffle&limit=100
```

## Query strategies

`resolveViewStrategy(source)` picks a fetch path based on the first ViewSource:

| Strategy | Condition | Fetch | Post-filter |
|---|---|---|---|
| `channel` | channels only | local query by slug, server-paginated | sort only |
| `channel-filtered` | channels + tags or search | local query (all tracks), client-paginated | tags, fuzzy, sort |
| `tags-only` | tags, no channels | remote Supabase overlaps | tagsMode=all, sort |
| `search-only` | search text, no channels/tags | local FTS live query | fuzzy, sort |
| `empty` | nothing specified | no fetch | — |

All strategies that fetch broadly (everything except `channel`) paginate client-side via `processViewTracks` + slice. The `channel` strategy delegates pagination to the query layer.

## Options

After `?`, global to all sources:

- `order` — `created` (default), `updated`, `name`, `tracks`, `shuffle`
- `direction` — `asc`, `desc` (default)
- `limit` — 1–4000
- `offset` — ≥ 0, pairs with `limit`
- `tagsMode` — `any` (default), `all`

## Saving and pinning views

A **SavedView** gives a View a name and persists it to localStorage: `{id, name, uri, position?, description?, created_at}`. `uri` is `serializeView(view)`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears it, `reorderPinnedViews(orderedIds)` updates sort weights.
