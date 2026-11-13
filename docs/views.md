# Views

Views are track-centric: they describe which tracks to include, from which channels, and how to display them. Channel cards on `/search` are outside the View pipeline — those come from `searchChannelsCombined()` ([search.md](search.md)).

The pipeline: query text → `parseView()` → `View` → `queryView()` → tracks. Inspect it live at `/docs/views`, which shows the parsed View JSON and queryView result.

```ts
type ViewURI = string & {readonly __brand: 'ViewURI'}
type ViewSource = {channels?; tags?; tagsMode?; mention?; search?}
type View = {sources: ViewSource[]; order?; direction?; limit?; offset?}
```

A View has two conceptual halves: `query` (sources — what to fetch) and `display` (order, direction, limit, offset — how to show it). They live in one flat object at runtime, but the distinction matters for serialization and strategy selection.

## Two serializations

A View has two lossless string forms:

`ViewURI` (`serializeView(view)`) — compact identity for storage and comparison. A string using `@mentions`, `#hashtags`, and free text, with options after `?`. Tags refer to track tags. The `r4://` prefix is optional. Saved views store this in their `uri` field. `viewURI(view)` normalizes first, for equality checks.

`SearchURL` (`viewToUrl(basePath, view)`) — page URL for navigation. Query text goes in `?q=`, display options become sibling URL params. `viewFromUrl(url)` reads it back.

The difference is structural: ViewURI is one string (`@ko002 #jazz?order=shuffle`), SearchURL splits across params (`?q=@ko002 #jazz&order=shuffle`). `viewLabel(view)` returns the human query text (sources only, no options) — this is what goes into `?q=`.

Channel routes (`/[slug]/tracks?tags=jazz,dub&q=text`) use a third, friendlier URL form: `channelViewFromUrl(url, slug)` reads it into a View. There `?q=` is plain search text (no `@`/`#` syntax) and `?tags=` are comma-separated bare tags with `tagsMode=all` — each selected tag narrows the result. `?mention=foo` matches the exact `@foo` token in track descriptions, case-insensitively, without changing the source channel. In saved/deck views this is `@source mention:@foo`; `@foo` alone still selects foo's tracks. On its own, `mention:@foo` finds tracks from any channel that mention foo.

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

| Strategy           | Condition                                       | Fetch and filter                                   |
| ------------------ | ----------------------------------------------- | -------------------------------------------------- |
| `channel`          | channels only                                   | each channel's full track list, paginated locally  |
| `channel-filtered` | one channel + tags, mention or text             | the same full list, filtered and paginated locally |
| `remote`           | anything else: no channel, or several + filters | `sdk.search.searchTracks`, one database query      |
| `empty`            | nothing specified                               | no fetch                                           |

The rule: whoever pages also filters. `remote` hands every part of the query to the database (`slug`, `tags @>`, `mentions @>`, full-text on `fts`), which orders, pages and returns the true count. Fetching one page and filtering it in the browser finds only the matches on that page; that was the `#techno #acid` bug. The search returns ids; queryView writes the rows into the tracks collection and reads them back by id in the server's order, so an edit to a track shows in the results.

`channel-filtered` is the exception because one channel's tracks are already in the browser, so filtering them there is complete. `processViewTracks` matches tags and mentions with the sdk's `extractTokens`, the same rule the database uses, and adds fuzzy text matching. Both channel strategies run the channel layout's own query (`eq(slug)`, newest first, no limit), so they share its cache entry: opening search or a tag view for a channel you just viewed downloads nothing, and changing filters or pages never refetches. Several channels with a filter go `remote`, so a filter doesn't download every channel. Standalone builds have no database and filter whatever is loaded.

## Tags and mentions

A track's `tags` and `mentions` are filled by a database trigger from its description. The rule (`parse_tokens` in radio4000/supabase, `extractTokens`/`findTokens` in the sdk) is the one Twitter and Bluesky use: `#` or `@` at the start or after anything but a letter, digit, `_`, `&` or `/`. A tag runs to the next space or `#`, trailing punctuation cut; a mention is a slug (letters, digits, `_`, `-`). Lowercased. Search input is read with the same rule (`parseQuery`), so `#Techno,` finds tracks tagged `techno`. `link-entities.svelte` renders description links from `findTokens`, so a link always points at a tag that exists.

## Options

After `?`, global to all sources:

- `order` — `created` (default), `updated`, `name`, `tracks`, `shuffle`
- `direction` — `asc`, `desc` (default)
- `limit` — 1–4000
- `offset` — ≥ 0, pairs with `limit`
- `tagsMode` — `all` is the only mode and the default for any source with tags; kept for old saved views
- `seed` — optional deterministic shuffle seed (used when `order=shuffle`) to share the same randomized order by URL

## Saving and pinning views

A `SavedView` gives a View a name and persists it to localStorage: `{id, name, uri, position?, description?, created_at}`. `uri` is `serializeView(view)`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears it, `reorderPinnedViews(orderedIds)` updates sort weights.
