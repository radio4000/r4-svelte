# Views

Views describe channel and track data. It is supposed to be a pattern we can reuse across URL params, filter and display UI, search and data loading. Views are private by design, sharable by nature.

We use views to power for example the /search. Here's a view:

```ts
type ViewSegment = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}

type View = ViewSegment & {
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
}
```

`ViewSegment` is the query part — what to fetch. `View` adds display options (sort, direction, limit).

We can go back and forth between human query strings, URL params, and r4:// URIs:

```js
parseSegment('@ko002 #jazz hello')
// {channels: ['ko002'], tags: ['jazz'], search: 'hello'}

serializeSegment({channels: ['ko002'], tags: ['jazz'], search: 'hello'})
// '@ko002 #jazz hello'

serializeParams({channels: ['ko002'], tags: ['jazz'], search: 'hello'}).toString()
// 'channels=ko002&tags=jazz&search=hello'

parseUri('r4://@alice #jazz;@bob #techno?order=shuffle')
// {segments: [{channels: ['alice'], tags: ['jazz']}, {channels: ['bob'], tags: ['techno']}], order: 'shuffle'}
```

- `@slug` → `channels` (e.g. `@oskar @ko002`)
- `#tag` → `tags` (e.g. `#jazz #dub`)
- Everything else → `search` (free-text FTS)

Tags always refer to track tags, not channel tags. When channels and tags combine, channels are fetched first, then tracks are post-filtered by tags client-side.

`processViewTracks(tracks, view)` applies post-processing to raw tracks: tag filtering (respects `tagsMode`), fuzzy search on title/description, sort by order/direction, shuffle, and limit. `queryView` uses it internally, but it can also be used standalone for in-memory filtering.

## URL representations

The /search route supports both ?q (for nice usability) and view URL params.

## Saving and pinning

While a **View** is a stateless query recipe (`{channels, tags, order, ...}`), a **SavedView** gives it a name and persists it to localStorage: `{id, name, params, position?, description?, created_at}`. `params` is `serializeParams(view).toString()`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears the position, `reorderPinnedViews(orderedIds)` updates sort weights.

Clicking a pinned view navigates to `/@slug` for single-channel views, `/search?params` for everything else, for now.

## ViewsBar

Shared component on `/search` and `/_debug/views`. Props: `view`, `onchange(view)`. Active detection: `serializeParams(view).toString() === sv.params`.

Three-state `mode`: **idle** (tabs + filter/display popovers), **adding** (clicked `+`, empty form to build a new view from scratch), **dirty** (changed filters after loading a saved view — shows a summary of active filters with "Save as" for a new view or "Update" to overwrite the base view).

## r4:// URI scheme

A compact, human-readable string encoding one or more channel/tag/search queries merged into a single queue — a **composite view**.

```
r4://@alice #jazz;@bob #techno,house;@coco miles davis?order=created&direction=desc&limit=100
```

Extends the existing human query syntax (`@slug #tag freetext`). A URI with no `;` segments is identical to the current `View` query.

### Syntax

```
r4://<segment>[;<segment>...][?<options>]
```

**Segments** (separated by `;`) are independent mini-queries, fetched in parallel and merged.

| Token         | Meaning              | Example       |
| ------------- | -------------------- | ------------- |
| `@slug`       | Tracks from channel  | `@ko002`      |
| `#tag`        | Filter tracks by tag | `#jazz`       |
| anything else | Full-text search     | `miles davis` |

Multiple `@` in a segment (`@ko002 @oskar`) means "from either channel", same as the current multi-channel `View`.

**Options** (after `?`, global to all segments):

| Key         | Values                                  | Default   | Meaning                                          |
| ----------- | --------------------------------------- | --------- | ------------------------------------------------ |
| `order`     | `created`, `updated`, `name`, `shuffle` | `created` | Sort applied to merged result                    |
| `direction` | `asc`, `desc`                           | `desc`    | Sort direction                                   |
| `limit`     | 1–4000                                  | none      | Max tracks after merge                           |
| `tagsMode`  | `any`, `all`                            | `any`     | Tag match for segments without explicit override |
| `exclude`   | comma-separated track UUIDs             | none      | Skip these track IDs                             |

### Examples

```
r4://@ko002
r4://@ko002 #jazz
r4://@ko002 #jazz miles davis?order=created&direction=asc&limit=50
r4://#jazz #dub?tagsMode=all
r4://?order=shuffle&limit=50

r4://@alice #jazz;@bob #techno,house;@coco miles davis
r4://@alice;@bob;@coco?order=shuffle&limit=100
r4://@ko002?exclude=uuid-1,uuid-2,uuid-3
r4://@ko002 #jazz;@oskar #dub?exclude=uuid-1,uuid-2
```

### Data types

`ViewSegment` is the query part of a `View` — what to fetch. Sort/limit/direction are display options and stay global. Already defined in `views.ts`.

```ts
type CompositeView = {
	segments: ViewSegment[] // 1..n
	order?: View['order']
	direction?: View['direction']
	limit?: number
	exclude?: string[] // track IDs to skip
}
```

A `CompositeView` with one segment and no `exclude` is equivalent to the current `View`.

### API

`parseUri(uri): CompositeView` — strip `r4://`, split on `?`, split body on `;`, parse each segment with `parseSegment`, parse options with `URLSearchParams`.

`serializeUri(cv): string` — each segment via `serializeSegment`, join with `;`, append `?key=value` for options.

### Current integration

`SavedView` stores views as `params: string` (URLSearchParams format). Plan is to replace with a `uri` field storing the URI body (without `r4://` prefix), so `parseUri('r4://' + sv.uri)` gives the full `CompositeView`. See `plan.md` for next steps on SavedView migration, broadcast payloads, and auto-radio seed.

`viewKey(view)` produces a canonical string for comparing views and seeding shuffle. Currently uses `serializeParams(normalizeView(view))`.

## Files

- `src/lib/views.ts` — `ViewSegment`, `View`, `CompositeView` types, pure parse/serialize helpers (`parseSegment`, `serializeSegment`, `parseParams`, `serializeParams`, `parseUri`, `serializeUri`, `normalizeView`, `viewKey`)
- `src/lib/views.svelte.ts` — `processViewTracks`, `queryView`, `getAutoDecksForView` (reactive, Svelte-dependent)
- `src/lib/collections/views.ts` — `SavedView`, `viewsCollection`, CRUD + pin/unpin helpers
- `src/lib/components/views-bar.svelte` — `ViewsBar` component
- `src/lib/components/pins-nav.svelte` — renders pinned views in the sidebar
- `src/routes/_debug/views/+page.svelte` — debug playground
- `src/routes/settings/pins/+page.svelte` — pin management
