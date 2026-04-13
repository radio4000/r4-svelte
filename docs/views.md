# Views

Views are track-centric: they describe which tracks to include, from which channels, and how to display them. Channel cards on `/search` are outside the View pipeline — those come from `searchChannelsCombined()` ([search.md](search.md)).

The pipeline: query text → `parseView()` → `View` → `queryView()` → tracks. Inspect it live at `/docs/views`, which shows the parsed View JSON and queryView result.

```ts
type ViewURI = string & {readonly __brand: 'ViewURI'}
type ViewSource = {channels?; tags?; tagsMode?; search?}
type View = {sources: ViewSource[]; order?; direction?; limit?; offset?}
```

A View has two conceptual halves: `query` (sources — what to fetch) and `display` (order, direction, limit, offset — how to show it). They live in one flat object at runtime, but the distinction matters for serialization and strategy selection.

## Two serializations

A View has two lossless string forms:

`ViewURI` (`serializeView(view)`) — compact identity for storage and comparison. A string using `@mentions`, `#hashtags`, and free text, with options after `?`. Tags refer to track tags. The `r4://` prefix is optional. Saved views store this in their `uri` field. `viewURI(view)` normalizes first, for equality checks.

`SearchURL` (`viewToUrl(basePath, view)`) — page URL for navigation. Query text goes in `?q=`, display options become sibling URL params. `viewFromUrl(url)` reads it back.

The difference is structural: ViewURI is one string (`@ko002 #jazz?order=shuffle`), SearchURL splits across params (`?q=@ko002 #jazz&order=shuffle`). `viewLabel(view)` returns the human query text (sources only, no options) — this is what goes into `?q=`.

```
@ko002
r4://@ko002 #jazz
@ko002 #jazz miles davis?order=created&direction=asc&limit=50
#jazz #dub?tagsMode=all
@alice @bob?limit=5
@alice #jazz;@bob #techno;@coco miles davis
@alice;@bob;@coco?order=shuffle&limit=100
```

Multi-source (experimental): `;`-separated sources parse and serialize correctly, but `queryView` reads only `sources[0]` at runtime.

## Query strategies

`resolveViewStrategy(source)` picks a fetch path based on the first ViewSource:

| Strategy           | Condition                     | Fetch                                      | Post-filter        |
| ------------------ | ----------------------------- | ------------------------------------------ | ------------------ |
| `channel`          | channels only                 | local query by slug, server-paginated      | sort only          |
| `channel-filtered` | channels + tags or search     | local query (all tracks), client-paginated | tags, fuzzy, sort  |
| `tags-only`        | tags, no channels             | remote Supabase overlaps                   | tagsMode=all, sort |
| `search-only`      | search text, no channels/tags | local FTS live query                       | fuzzy, sort        |
| `empty`            | nothing specified             | no fetch                                   | —                  |

All strategies that fetch broadly (everything except `channel`) paginate client-side via `processViewTracks` + slice. The `channel` strategy delegates pagination to the query layer.

## Options

After `?`, global to all sources:

- `order` — `created` (default), `updated`, `name`, `tracks`, `shuffle`
- `direction` — `asc`, `desc` (default)
- `limit` — 1–4000
- `offset` — ≥ 0, pairs with `limit`
- `tagsMode` — `any` (default), `all`
- `seed` — optional deterministic shuffle seed (used when `order=shuffle`) to share the same randomized order by URL

## Saving and pinning views

A `SavedView` gives a View a name and persists it to localStorage: `{id, name, uri, position?, description?, created_at}`. `uri` is `serializeView(view)`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears it, `reorderPinnedViews(orderedIds)` updates sort weights.
